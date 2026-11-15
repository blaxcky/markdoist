package de.markdoist.localstt

import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import com.k2fsa.sherpa.onnx.FeatureConfig
import com.k2fsa.sherpa.onnx.OfflineModelConfig
import com.k2fsa.sherpa.onnx.OfflineRecognizer
import com.k2fsa.sherpa.onnx.OfflineRecognizerConfig
import com.k2fsa.sherpa.onnx.OfflineTransducerModelConfig
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.nio.ByteOrder
import java.security.MessageDigest

class ModelFile : Record {
  @Field val name: String = ""
  @Field val size: Double = 0.0
  @Field val sha256: String = ""
}

/**
 * Lokale Erkennung (Plan 4.12): Parakeet TDT 0.6B v3 über sherpa-onnx. Lädt das Modell ins App-Verzeichnis
 * (nie in den Aufgabenordner), dekodiert die m4a-Aufnahme zu 16 kHz mono und erkennt sie. Ablauflogik und
 * Texte liegen in TypeScript.
 */
class LocalSttModule : Module() {
  private val context
    get() = appContext.reactContext ?: throw CodedException("ERR_NO_CONTEXT", "Kein Android-Kontext", null)

  @Volatile private var cancelled = false
  private val lock = Any()
  private var recognizer: OfflineRecognizer? = null
  private var loadedDir: String? = null
  private var lastUse = 0L

  private fun modelDir(id: String): File {
    require(Regex("^[A-Za-z0-9._-]+$").matches(id)) { "Ungültige Modellkennung" }
    return File(context.filesDir, "models/$id")
  }

  private fun complete(dir: File, files: List<ModelFile>) =
    files.all { File(dir, it.name).let { f -> f.isFile && f.length() == it.size.toLong() } }

  override fun definition() = ModuleDefinition {
    Name("LocalStt")
    Events("onProgress")

    // Fehlt die native Bibliothek für diese Prozessorarchitektur, gibt es keine lokale Erkennung.
    Function("isAvailable") {
      try {
        System.loadLibrary("sherpa-onnx-jni")
        true
      } catch (e: Throwable) {
        false
      }
    }

    AsyncFunction("isComplete") { id: String, files: List<ModelFile> -> complete(modelDir(id), files) }

    AsyncFunction("download") Coroutine { id: String, baseUrl: String, files: List<ModelFile> ->
      withContext(Dispatchers.IO) { download(modelDir(id), baseUrl, files) }
    }

    Function("cancel") { cancelled = true }

    AsyncFunction("remove") Coroutine { id: String ->
      withContext(Dispatchers.IO) {
        cancelled = true
        release()
        modelDir(id).deleteRecursively()
      }
    }

    AsyncFunction("transcribe") Coroutine { id: String, fileUri: String ->
      withContext(Dispatchers.Default) { transcribe(modelDir(id), fileUri) }
    }

    OnDestroy { release() }
  }

  /** Jede Datei erst als `.part`, nach bestandener SHA-256-Prüfung umbenannt. Fortschritt höchstens 4× je Sekunde. */
  private fun download(dir: File, baseUrl: String, files: List<ModelFile>) {
    cancelled = false
    dir.mkdirs()
    val total = files.sumOf { it.size.toLong() }
    var done = 0L
    var lastEmit = 0L
    fun emit(force: Boolean = false) {
      val now = System.currentTimeMillis()
      if (!force && now - lastEmit < 250) return
      lastEmit = now
      sendEvent("onProgress", mapOf("received" to done.toDouble(), "total" to total.toDouble()))
    }
    for (f in files) {
      val target = File(dir, f.name)
      if (target.isFile && target.length() == f.size.toLong()) {
        done += f.size.toLong()
        emit(true)
        continue
      }
      val part = File(dir, "${f.name}.part")
      val conn = URL("$baseUrl/${f.name}").openConnection() as HttpURLConnection
      conn.connectTimeout = 20_000
      conn.readTimeout = 60_000
      conn.instanceFollowRedirects = true
      try {
        val status = conn.responseCode
        if (status !in 200..299) throw CodedException("ERR_HTTP", "HTTP $status bei ${f.name}", null)
        val md = MessageDigest.getInstance("SHA-256")
        conn.inputStream.use { input ->
          FileOutputStream(part).use { out ->
            val buf = ByteArray(1 shl 16)
            while (true) {
              if (cancelled) throw CodedException("ERR_CANCELLED", "Abgebrochen", null)
              val n = input.read(buf)
              if (n < 0) break
              md.update(buf, 0, n)
              out.write(buf, 0, n)
              done += n
              emit()
            }
          }
        }
        val hex = md.digest().joinToString("") { "%02x".format(it) }
        if (hex != f.sha256) {
          part.delete()
          throw CodedException("ERR_CHECKSUM", "Prüfsumme von ${f.name} stimmt nicht", null)
        }
        if (!part.renameTo(target)) throw CodedException("ERR_IO", "${f.name} ließ sich nicht ablegen", null)
      } finally {
        conn.disconnect()
      }
    }
    emit(true)
  }

  private fun transcribe(dir: File, fileUri: String): String {
    val path = Uri.parse(fileUri).path ?: fileUri
    val samples = decodeToMono(path, 16_000)
    if (samples.isEmpty()) return ""
    synchronized(lock) {
      val rec = recognizerFor(dir)
      val stream = rec.createStream()
      try {
        stream.acceptWaveform(samples, 16_000)
        rec.decode(stream)
        return rec.getResult(stream).text
      } finally {
        stream.release()
        lastUse = System.currentTimeMillis()
        scheduleRelease()
      }
    }
  }

  private fun recognizerFor(dir: File): OfflineRecognizer {
    val path = dir.absolutePath
    recognizer?.let { if (loadedDir == path) return it }
    recognizer?.release()
    val threads = Runtime.getRuntime().availableProcessors().coerceIn(1, 4)
    val config = OfflineRecognizerConfig(
      featConfig = FeatureConfig(sampleRate = 16_000, featureDim = 80),
      modelConfig = OfflineModelConfig(
        transducer = OfflineTransducerModelConfig(
          encoder = "$path/encoder.int8.onnx",
          decoder = "$path/decoder.int8.onnx",
          joiner = "$path/joiner.int8.onnx",
        ),
        tokens = "$path/tokens.txt",
        numThreads = threads,
        debug = false,
        provider = "cpu",
        modelType = "nemo_transducer",
      ),
      decodingMethod = "greedy_search",
    )
    return OfflineRecognizer(null, config).also {
      recognizer = it
      loadedDir = path
    }
  }

  /** Das Modell belegt rund 1 GB; nach 5 Minuten ohne Diktat wird es freigegeben. */
  private fun scheduleRelease() {
    val mine = lastUse
    Thread {
      Thread.sleep(5 * 60_000L)
      synchronized(lock) { if (lastUse == mine) release() }
    }.apply { isDaemon = true }.start()
  }

  private fun release() {
    synchronized(lock) {
      recognizer?.release()
      recognizer = null
      loadedDir = null
    }
  }

  /** Dekodiert die erste Audiospur (z. B. AAC in m4a) zu Float32 mono mit der gewünschten Abtastrate. */
  private fun decodeToMono(path: String, targetRate: Int): FloatArray {
    val ex = MediaExtractor()
    ex.setDataSource(path)
    try {
      val track = (0 until ex.trackCount).firstOrNull { ex.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true }
        ?: throw CodedException("ERR_AUDIO", "Keine Audiospur", null)
      val format = ex.getTrackFormat(track)
      ex.selectTrack(track)
      val codec = MediaCodec.createDecoderByType(format.getString(MediaFormat.KEY_MIME)!!)
      codec.configure(format, null, null, 0)
      codec.start()
      var rate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
      var channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
      var encoding = AudioFormat.ENCODING_PCM_16BIT
      var out = FloatArray(1 shl 16)
      var count = 0
      val info = MediaCodec.BufferInfo()
      var inputDone = false
      try {
        while (true) {
          if (!inputDone) {
            val i = codec.dequeueInputBuffer(10_000)
            if (i >= 0) {
              val buf = codec.getInputBuffer(i)!!
              val n = ex.readSampleData(buf, 0)
              if (n < 0) {
                codec.queueInputBuffer(i, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                inputDone = true
              } else {
                codec.queueInputBuffer(i, 0, n, ex.sampleTime, 0)
                ex.advance()
              }
            }
          }
          val o = codec.dequeueOutputBuffer(info, 10_000)
          if (o == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
            val f = codec.outputFormat
            rate = f.getInteger(MediaFormat.KEY_SAMPLE_RATE)
            channels = f.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
            if (f.containsKey(MediaFormat.KEY_PCM_ENCODING)) encoding = f.getInteger(MediaFormat.KEY_PCM_ENCODING)
          } else if (o >= 0) {
            val buf = codec.getOutputBuffer(o)!!.order(ByteOrder.nativeOrder())
            buf.position(info.offset)
            buf.limit(info.offset + info.size)
            val frames = if (encoding == AudioFormat.ENCODING_PCM_FLOAT) info.size / 4 / channels else info.size / 2 / channels
            if (count + frames > out.size) out = out.copyOf(maxOf(out.size * 2, count + frames))
            for (fr in 0 until frames) {
              var sum = 0f
              for (c in 0 until channels) sum += if (encoding == AudioFormat.ENCODING_PCM_FLOAT) buf.float else buf.short / 32768f
              out[count++] = sum / channels
            }
            codec.releaseOutputBuffer(o, false)
            if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) break
          }
        }
      } finally {
        codec.stop()
        codec.release()
      }
      return resample(out.copyOf(count), rate, targetRate)
    } finally {
      ex.release()
    }
  }

  /** Lineare Umrechnung der Abtastrate; bei gleicher Rate unverändert. */
  private fun resample(input: FloatArray, from: Int, to: Int): FloatArray {
    if (from == to || input.isEmpty()) return input
    val n = (input.size.toLong() * to / from).toInt()
    val ratio = from.toDouble() / to
    return FloatArray(n) { i ->
      val pos = i * ratio
      val j = pos.toInt()
      val frac = (pos - j).toFloat()
      val a = input[minOf(j, input.size - 1)]
      val b = input[minOf(j + 1, input.size - 1)]
      a + (b - a) * frac
    }
  }
}
