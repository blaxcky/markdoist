# sherpa-onnx liest Konfiguration und Ergebnis per JNI über Klassen- und Feldnamen; R8 darf nichts umbenennen.
-keep class com.k2fsa.sherpa.onnx.** { *; }
