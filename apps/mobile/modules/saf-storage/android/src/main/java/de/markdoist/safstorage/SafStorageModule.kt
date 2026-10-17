package de.markdoist.safstorage

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.DocumentsContract.Document
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileNotFoundException
import java.io.FileOutputStream
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction
import java.security.MessageDigest

/**
 * SAF-Grundoperationen für Markdoist (Plan 7.3). Ablauflogik, Hash-Prüfungen und
 * Wiederherstellung liegen in TypeScript; hier nur Bausteine mit klaren Fehlercodes.
 */
class SafStorageModule : Module() {
  private val pickRequest = 47110
  private var pickPromise: Promise? = null
  private val supportedAuthority = "com.android.externalstorage.documents"

  private val context
    get() = appContext.reactContext ?: throw CodedException("ERR_NO_CONTEXT", "Kein Android-Kontext", null)

  private val resolver
    get() = context.contentResolver

  private fun sha256(bytes: ByteArray): String =
    MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

  private fun <T> mapped(block: () -> T): T {
    try {
      return block()
    } catch (e: CodedException) {
      throw e
    } catch (e: SecurityException) {
      throw CodedException("ERR_PERMISSION", e.message ?: "Keine Berechtigung", e)
    } catch (e: FileNotFoundException) {
      throw CodedException("ERR_MISSING", e.message ?: "Datei fehlt", e)
    } catch (e: IOException) {
      val msg = e.message ?: ""
      if (msg.contains("ENOSPC") || msg.contains("No space", ignoreCase = true)) {
        throw CodedException("ERR_FULL", msg, e)
      }
      throw CodedException("ERR_IO", msg, e)
    } catch (e: IllegalArgumentException) {
      throw CodedException("ERR_MISSING", e.message ?: "Ungültige Referenz", e)
    }
  }

  private fun meta(uri: Uri): Map<String, Any?> {
    resolver.query(
      uri,
      arrayOf(Document.COLUMN_DISPLAY_NAME, Document.COLUMN_LAST_MODIFIED, Document.COLUMN_SIZE, Document.COLUMN_MIME_TYPE),
      null,
      null,
      null,
    )?.use { c ->
      if (c.moveToFirst()) {
        return mapOf(
          "name" to c.getString(0),
          "mtime" to if (c.isNull(1)) null else c.getLong(1).toDouble(),
          "size" to if (c.isNull(2)) null else c.getLong(2).toDouble(),
          "mime" to c.getString(3),
        )
      }
    }
    throw FileNotFoundException("Dokument nicht gefunden: $uri")
  }

  private fun readBytes(uri: Uri): ByteArray =
    resolver.openInputStream(uri)?.use { it.readBytes() } ?: throw FileNotFoundException(uri.toString())

  private fun atomicWrite(file: File, data: String) {
    file.parentFile?.mkdirs()
    val tmp = File(file.parentFile, file.name + ".tmp")
    FileOutputStream(tmp).use { out ->
      out.write(data.toByteArray(Charsets.UTF_8))
      out.flush()
      out.fd.sync()
    }
    if (!tmp.renameTo(file)) throw IOException("Umbenennen fehlgeschlagen: ${file.name}")
  }

  private fun dir(name: String) = File(context.filesDir, name)

  private val readPool = java.util.concurrent.Executors.newFixedThreadPool(6)

  private fun readOne(uri: String): Map<String, Any?>? =
    try {
      val bytes = readBytes(Uri.parse(uri))
      val decoder = Charsets.UTF_8.newDecoder()
        .onMalformedInput(CodingErrorAction.REPORT)
        .onUnmappableCharacter(CodingErrorAction.REPORT)
      var invalid = false
      val text = try {
        decoder.decode(ByteBuffer.wrap(bytes)).toString()
      } catch (e: CharacterCodingException) {
        invalid = true
        String(bytes, Charsets.UTF_8)
      }
      mapOf("text" to text, "hash" to sha256(bytes), "invalidUtf8" to invalid, "mtime" to null, "size" to bytes.size.toDouble())
    } catch (e: Exception) {
      null
    }

  private fun safeKey(key: String): String =
    MessageDigest.getInstance("SHA-256").digest(key.toByteArray()).joinToString("") { "%02x".format(it) }.substring(0, 40)

  override fun definition() = ModuleDefinition {
    Name("SafStorage")

    Constants("supportedAuthority" to supportedAuthority)

    // Ordnerauswahl mit dauerhafter Berechtigung; nur der lokale gemeinsame Speicher (7.3).
    AsyncFunction("pickFolder") { initial: String?, promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.reject(CodedException("ERR_NO_ACTIVITY", "Keine Activity", null))
        return@AsyncFunction
      }
      pickPromise?.reject(CodedException("ERR_CANCELLED", "Neue Auswahl gestartet", null))
      pickPromise = promise
      val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
        addFlags(
          Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
            Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION,
        )
        if (initial != null) putExtra(DocumentsContract.EXTRA_INITIAL_URI, Uri.parse(initial))
      }
      activity.startActivityForResult(intent, pickRequest)
    }

    OnActivityResult { _, payload ->
      if (payload.requestCode != pickRequest) return@OnActivityResult
      val p = pickPromise ?: return@OnActivityResult
      pickPromise = null
      val uri = payload.data?.data
      if (payload.resultCode != Activity.RESULT_OK || uri == null) {
        p.resolve(null)
        return@OnActivityResult
      }
      if (uri.authority != supportedAuthority) {
        p.reject(CodedException("ERR_UNSUPPORTED_PROVIDER", "Nur Ordner im lokalen Gerätespeicher werden unterstützt", null))
        return@OnActivityResult
      }
      try {
        resolver.takePersistableUriPermission(
          uri,
          Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
        )
        val docId = DocumentsContract.getTreeDocumentId(uri)
        val docUri = DocumentsContract.buildDocumentUriUsingTree(uri, docId)
        p.resolve(mapOf("treeUri" to uri.toString(), "rootDocId" to docId, "name" to (meta(docUri)["name"] ?: docId)))
      } catch (e: Exception) {
        p.reject(CodedException("ERR_PERMISSION", e.message ?: "Berechtigung nicht erhalten", e))
      }
    }

    Function("hasPermission") { treeUri: String ->
      val u = Uri.parse(treeUri)
      resolver.persistedUriPermissions.any { it.uri == u && it.isReadPermission && it.isWritePermission }
    }

    Function("rootDocId") { treeUri: String -> DocumentsContract.getTreeDocumentId(Uri.parse(treeUri)) }

    // Kinder eines Ordners in einer einzigen Abfrage (7.1 schneller Abgleich).
    AsyncFunction("listChildren") { treeUri: String, parentDocId: String ->
      mapped {
        val tree = Uri.parse(treeUri)
        val children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, parentDocId)
        val out = mutableListOf<Map<String, Any?>>()
        resolver.query(
          children,
          arrayOf(
            Document.COLUMN_DOCUMENT_ID,
            Document.COLUMN_DISPLAY_NAME,
            Document.COLUMN_MIME_TYPE,
            Document.COLUMN_LAST_MODIFIED,
            Document.COLUMN_SIZE,
            Document.COLUMN_FLAGS,
          ),
          null,
          null,
          null,
        )?.use { c ->
          while (c.moveToNext()) {
            val id = c.getString(0)
            out.add(
              mapOf(
                "docId" to id,
                "uri" to DocumentsContract.buildDocumentUriUsingTree(tree, id).toString(),
                "name" to c.getString(1),
                "isDir" to (c.getString(2) == Document.MIME_TYPE_DIR),
                "mtime" to if (c.isNull(3)) null else c.getLong(3).toDouble(),
                "size" to if (c.isNull(4)) null else c.getLong(4).toDouble(),
                "flags" to c.getInt(5),
              ),
            )
          }
        } ?: throw IOException("Ordner nicht lesbar")
        out
      }
    }

    AsyncFunction("readFile") { uri: String ->
      mapped {
        val u = Uri.parse(uri)
        val bytes = readBytes(u)
        val m = meta(u)
        val decoder = Charsets.UTF_8.newDecoder()
          .onMalformedInput(CodingErrorAction.REPORT)
          .onUnmappableCharacter(CodingErrorAction.REPORT)
        var invalid = false
        val text = try {
          decoder.decode(ByteBuffer.wrap(bytes)).toString()
        } catch (e: CharacterCodingException) {
          invalid = true
          String(bytes, Charsets.UTF_8)
        }
        mapOf("text" to text, "hash" to sha256(bytes), "invalidUtf8" to invalid, "mtime" to m["mtime"], "size" to m["size"])
      }
    }

    // Stapelweise lesen (7.1 Vollabgleich): ein Aufruf je Stapel, keine Metadaten-Abfrage je Datei.
    AsyncFunction("readFiles") { uris: List<String> ->
      // Parallel lesen: jeder Zugriff ist ein IPC-Aufruf an den Dokumentanbieter.
      uris.map { uri -> readPool.submit<Map<String, Any?>?> { readOne(uri) } }.map { it.get() }
    }

    AsyncFunction("hashFile") { uri: String ->
      mapped { sha256(readBytes(Uri.parse(uri))) }
    }

    // Ausdrückliches Kürzen mit "wt", flush und sync; Rückgabe ist der zurückgelesene Hash (7.3).
    AsyncFunction("writeFile") { uri: String, text: String ->
      mapped {
        val u = Uri.parse(uri)
        val pfd = resolver.openFileDescriptor(u, "wt") ?: throw FileNotFoundException(uri)
        pfd.use {
          FileOutputStream(it.fileDescriptor).use { out ->
            out.write(text.toByteArray(Charsets.UTF_8))
            out.flush()
            it.fileDescriptor.sync()
          }
        }
        sha256(readBytes(u))
      }
    }

    AsyncFunction("createFile") { treeUri: String, parentDocId: String, name: String, mime: String ->
      mapped {
        val tree = Uri.parse(treeUri)
        val parent = DocumentsContract.buildDocumentUriUsingTree(tree, parentDocId)
        val created = DocumentsContract.createDocument(resolver, parent, mime, name)
          ?: throw IOException("Datei konnte nicht angelegt werden")
        val docId = DocumentsContract.getDocumentId(created)
        mapOf("uri" to created.toString(), "docId" to docId, "name" to meta(created)["name"])
      }
    }

    AsyncFunction("renameDocument") { uri: String, newName: String ->
      mapped {
        val u = Uri.parse(uri)
        val renamed = DocumentsContract.renameDocument(resolver, u, newName) ?: u
        mapOf("uri" to renamed.toString(), "docId" to DocumentsContract.getDocumentId(renamed), "name" to meta(renamed)["name"])
      }
    }

    AsyncFunction("moveDocument") { uri: String, sourceParentUri: String, targetParentUri: String ->
      mapped {
        val moved = DocumentsContract.moveDocument(resolver, Uri.parse(uri), Uri.parse(sourceParentUri), Uri.parse(targetParentUri))
          ?: throw IOException("Verschieben nicht unterstützt")
        mapOf("uri" to moved.toString(), "docId" to DocumentsContract.getDocumentId(moved), "name" to meta(moved)["name"])
      }
    }

    AsyncFunction("deleteDocument") { uri: String ->
      mapped {
        if (!DocumentsContract.deleteDocument(resolver, Uri.parse(uri))) throw IOException("Löschen fehlgeschlagen")
        true
      }
    }

    // Dauerhaftes, app-lokales Operationsjournal (kein löschbarer Cache, 7.3).
    AsyncFunction("journalWrite") { id: String, json: String ->
      mapped { atomicWrite(File(dir("markdoist-journal"), "$id.json"), json) }
    }

    AsyncFunction("journalList") {
      mapped {
        (dir("markdoist-journal").listFiles() ?: emptyArray())
          .filter { it.name.endsWith(".json") }
          .map { it.readText(Charsets.UTF_8) }
      }
    }

    AsyncFunction("journalDelete") { id: String ->
      mapped { File(dir("markdoist-journal"), "$id.json").delete() }
    }

    // Gerätelokaler Schlüssel-Wert-Speicher für Undo, Entwürfe und Cache.
    AsyncFunction("kvGet") { key: String ->
      mapped {
        val f = File(dir("markdoist-kv"), safeKey(key))
        if (f.exists()) f.readText(Charsets.UTF_8) else null
      }
    }

    AsyncFunction("kvSet") { key: String, value: String ->
      mapped { atomicWrite(File(dir("markdoist-kv"), safeKey(key)), value) }
    }

    AsyncFunction("kvDelete") { key: String ->
      mapped { File(dir("markdoist-kv"), safeKey(key)).delete() }
    }
  }
}
