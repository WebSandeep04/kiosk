import { NativeModules } from 'react-native';

const { FaceRecognitionModule } = NativeModules;

export const nativeFaceRecognition = {
  /**
   * Extract high-precision 192-dimensional unit vector embedding from a local image path
   * via ML Kit Face Detection + MobileFaceNet TFLite Inference.
   */
  async extractFaceEmbedding(imageUriString: string): Promise<number[]> {
    if (!FaceRecognitionModule) {
      throw new Error('Native FaceRecognitionModule is not linked or not supported on this platform.');
    }
    return await FaceRecognitionModule.extractFaceEmbedding(imageUriString);
  }
};
