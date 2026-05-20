package com.kiosapp

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Rect
import android.net.Uri
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import org.tensorflow.lite.Interpreter
import java.io.FileInputStream
import java.io.InputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.channels.FileChannel

class FaceRecognitionModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private var tflite: Interpreter? = null
    private val modelFilename = "mobilefacenet.tflite"
    private val inputSize = 112

    override fun getName(): String {
        return "FaceRecognitionModule"
    }

    private fun loadModelFile(): ByteBuffer {
        val fileDescriptor = reactApplicationContext.assets.openFd(modelFilename)
        val inputStream = FileInputStream(fileDescriptor.fileDescriptor)
        val fileChannel = inputStream.channel
        val startOffset = fileDescriptor.startOffset
        val declaredLength = fileDescriptor.declaredLength
        return fileChannel.map(FileChannel.MapMode.READ_ONLY, startOffset, declaredLength)
    }

    private fun getInterpreter(): Interpreter {
        if (tflite == null) {
            val options = Interpreter.Options()
            options.setNumThreads(4)
            tflite = Interpreter(loadModelFile(), options)
        }
        return tflite!!
    }

    @ReactMethod
    fun extractFaceEmbedding(imageUriString: String, promise: Promise) {
        try {
            // 1. Resolve bitmap from URI safely
            val context = reactApplicationContext
            var cleanUriString = imageUriString
            if (cleanUriString.startsWith("file://")) {
                cleanUriString = cleanUriString.substring(7)
            }
            
            val bitmap = BitmapFactory.decodeFile(cleanUriString)
            if (bitmap == null) {
                promise.reject("INVALID_IMAGE", "Could not load or decode image from path: $imageUriString")
                return
            }

            // 2. Setup Google ML Kit high-precision face detector options
            val detectorOptions = FaceDetectorOptions.Builder()
                .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_ACCURATE)
                .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_NONE)
                .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_NONE)
                .build()
            
            val detector = FaceDetection.getClient(detectorOptions)
            val inputImage = InputImage.fromBitmap(bitmap, 0)

            detector.process(inputImage)
                .addOnSuccessListener { faces ->
                    if (faces.isEmpty()) {
                        promise.reject("NO_FACE_DETECTED", "No face was detected in the frame. Position your face in the guide.")
                        return@addOnSuccessListener
                    }

                    // 3. Process the first detected face boundaries
                    val face = faces[0]
                    val boundingBox = face.boundingBox

                    // Add safety bounds checking for cropping
                    val cropRect = Rect(
                        Math.max(0, boundingBox.left),
                        Math.max(0, boundingBox.top),
                        Math.min(bitmap.width, boundingBox.right),
                        Math.min(bitmap.height, boundingBox.bottom)
                    )

                    if (cropRect.width() <= 0 || cropRect.height() <= 0) {
                        promise.reject("INVALID_FACE_BOUNDS", "Face bounding box coordinates are invalid.")
                        return@addOnSuccessListener
                    }

                    // 4. Crop face and resize to 112x112 as expected by MobileFaceNet
                    val croppedBitmap = Bitmap.createBitmap(
                        bitmap,
                        cropRect.left,
                        cropRect.top,
                        cropRect.width(),
                        cropRect.height()
                    )
                    
                    val resizedBitmap = Bitmap.createScaledBitmap(croppedBitmap, inputSize, inputSize, true)

                    // 5. Pre-process cropped bitmap to normalized float byte buffer (MobileFaceNet expects RGB normalized -1 to 1)
                    val byteBuffer = ByteBuffer.allocateDirect(1 * inputSize * inputSize * 3 * 4) // 4 bytes per float
                    byteBuffer.order(ByteOrder.nativeOrder())
                    byteBuffer.rewind()

                    val intValues = IntArray(inputSize * inputSize)
                    resizedBitmap.getPixels(intValues, 0, resizedBitmap.width, 0, 0, resizedBitmap.width, resizedBitmap.height)

                    for (i in 0 until inputSize * inputSize) {
                        val pixelVal = intValues[i]
                        // Extract channel values
                        val r = (pixelVal shr 16) and 0xFF
                        val g = (pixelVal shr 8) and 0xFF
                        val b = pixelVal and 0xFF

                        // Normalize to MobileFaceNet [-1.0, 1.0] range (standard normalization: (val - 127.5) / 128.0)
                        byteBuffer.putFloat((r - 127.5f) / 128.0f)
                        byteBuffer.putFloat((g - 127.5f) / 128.0f)
                        byteBuffer.putFloat((b - 127.5f) / 128.0f)
                    }

                    // 6. Run TensorFlow Lite Inference
                    val outputArray = Array(1) { FloatArray(128) }
                    getInterpreter().run(byteBuffer, outputArray)

                    val rawEmbedding = outputArray[0]

                    // 7. L2 Normalize the 128-float output vector mathematically to unit length
                    var sumSquares = 0.0f
                    for (v in rawEmbedding) {
                        sumSquares += v * v
                    }
                    val magnitude = Math.sqrt(sumSquares.toDouble()).toFloat()
                    val normalizedEmbedding = FloatArray(128)
                    for (i in rawEmbedding.indices) {
                        normalizedEmbedding[i] = if (magnitude > 0.0f) rawEmbedding[i] / magnitude else 0.0f
                    }

                    // 8. Pack embedding vector into React Native WritableArray response
                    val writableArray = Arguments.createArray()
                    for (v in normalizedEmbedding) {
                        writableArray.pushDouble(v.toDouble())
                    }

                    promise.resolve(writableArray)
                }
                .addOnFailureListener { exception ->
                    promise.reject("DETECTION_ERROR", "ML Kit processing failed: ${exception.message}", exception)
                }

        } catch (e: Exception) {
            promise.reject("EXCEPTION", "An unexpected native error occurred: ${e.message}", e)
        }
    }
}
