import * as faceapi from "face-api.js";
import { getSetting } from "./utils/settings";

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

  // GET FACE LANDMARKS (for liveness)

  async getFaceLandmarks(videoElement) {
    try {
      const detection = await faceapi
        .detectSingleFace(
          videoElement,
          new faceapi.TinyFaceDetectorOptions({
            inputSize: 320,
            scoreThreshold: 0.5,
          })
        )
        .withFaceLandmarks();
      
      return detection ? detection.landmarks : null;
    } catch (err) {
      console.error("Face landmarks error:", err);
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

    // Get threshold from settings (default 0.5)
    const threshold = getSetting("recognitionThreshold");

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

      // Handle both encrypted and plain descriptors
      let storedDescriptor;
      if (typeof employee.descriptor === "string") {
        // Encrypted - decrypt first (handled in component before calling this)
        // For now, skip encrypted ones in matching (will be handled by caller)
        return;
      } else if (employee.descriptor instanceof Float32Array) {
        storedDescriptor = employee.descriptor;
      } else if (Array.isArray(employee.descriptor)) {
        storedDescriptor = new Float32Array(employee.descriptor);
      } else {
        console.warn("Unknown descriptor type:", employee?.name);
        return;
      }

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

    // MATCH FOUND (using configurable threshold)

    if (
      minDistance < threshold
    ) {

      console.log(
        "Matched:",
        bestMatch?.name,
        "distance:",
        minDistance.toFixed(4)
      );

      return bestMatch.name;

    }

    // NO MATCH

    console.log(
      "Unknown Face - min distance:",
      minDistance.toFixed(4),
      "threshold:",
      threshold
    );

    return null;

  },

  // CHECK FOR DUPLICATE FACE (during enrollment)

  checkDuplicateFace(capturedDescriptor, storedEmployees) {
    if (!capturedDescriptor) return null;
    if (!storedEmployees || storedEmployees.length === 0) return null;

    const threshold = getSetting("recognitionThreshold") * 0.8; // Stricter for duplicates

    for (const employee of storedEmployees) {
      if (!employee?.descriptor) continue;

      let storedDescriptor;
      if (employee.descriptor instanceof Float32Array) {
        storedDescriptor = employee.descriptor;
      } else if (Array.isArray(employee.descriptor)) {
        storedDescriptor = new Float32Array(employee.descriptor);
      } else {
        continue;
      }

      const distance = faceapi.euclideanDistance(
        capturedDescriptor,
        storedDescriptor
      );

      if (distance < threshold) {
        return employee; // Return the matching employee
      }
    }

    return null; // No duplicate found
  },

};