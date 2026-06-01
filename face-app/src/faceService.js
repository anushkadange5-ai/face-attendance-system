import * as faceapi from "face-api.js";

export const faceService = {

  // LOAD MODELS

  async loadModels() {

    const MODEL_URL = "/models";

    try {

      await Promise.all([

        faceapi.nets.tinyFaceDetector.loadFromUri(
          MODEL_URL
        ),

        faceapi.nets.faceLandmark68Net.loadFromUri(
          MODEL_URL
        ),

        faceapi.nets.faceRecognitionNet.loadFromUri(
          MODEL_URL
        ),

        faceapi.nets.ssdMobilenetv1.loadFromUri(
          MODEL_URL
        ),

      ]);

      console.log(
        "Face API models loaded successfully"
      );

      return true;

    } catch (error) {

      console.error(
        "Error loading face-api models:",
        error
      );

      return false;

    }

  },

  // GET FACE DESCRIPTOR

  async getFaceDescriptor(
    videoElement
  ) {

    try {
          const detection =
            await faceapi
              .detectSingleFace(
                videoElement,
                new faceapi.TinyFaceDetectorOptions({
                  inputSize: 320,
                  scoreThreshold: 0.5,
                })
              )
          .withFaceLandmarks()
          .withFaceDescriptor();
      console.log("Detection Result:", detection);
      return detection
        ? detection.descriptor
        : null;

    } catch (err) {

      console.error(
        "Face detection error:",
        err
      );

      return null;

    }

  },

  // MATCH FACE

  matchFace(
    capturedDescriptor,
    storedEmployees
  ) {

    if (!capturedDescriptor) {
      return null;
    }
    if (
      !storedEmployees ||
      storedEmployees.length === 0
    ) {

      return null;

    }

    let bestMatch = null;

    let minDistance = 999;

    // CHECK EVERY EMPLOYEE

   storedEmployees.forEach((employee) => {

  if (
    !employee ||
    !employee.descriptor
  ) {
    console.warn(
      "Employee descriptor missing:",
      employee?.name
    );
    return;
  }

  const storedDescriptor =
    new Float32Array(
      employee.descriptor
    );

  const distance =
    faceapi.euclideanDistance(
      capturedDescriptor,
      storedDescriptor
    );

  console.log(
    employee.name,
    "distance:",
    distance
  );

  if (distance < minDistance) {

    minDistance = distance;

    bestMatch = employee;

  }

});

    // STRICT THRESHOLD 😎

    const threshold = 0.32;

    // MATCH FOUND

    if (
      minDistance < threshold
    ) {

      console.log(
        "Matched:",
        bestMatch?.name
      );

      return bestMatch.name;

    }

    // NO MATCH

    console.log(
      "Unknown Face"
    );

    return null;

  },

};