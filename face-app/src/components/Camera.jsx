import Webcam from "react-webcam";
import * as faceapi from "face-api.js";
import { useRef, useEffect, useState, useCallback } from "react";
import { faceService } from "../faceService";
import { db } from "../db";
import { toJsDate } from "../utils/time";
import { loadSettings, getSetting } from "../utils/settings";

function Camera({ modelsReady = false }) {
  const webcamRef = useRef(null);
  const processingRef = useRef(false);
  const livenessHistoryRef = useRef([]);
  const livenessFramesRef = useRef(0);
  const lastDetectionRef = useRef({});

  const [message, setMessage] = useState("Scanning Face...");
  const [status, setStatus] = useState("Waiting for employee...");
  const [audioEnabled, setAudioEnabled] = useState(false);
  const audioEnabledRef = useRef(false);
  const voicesRef = useRef([]);
  const audioCtxRef = useRef(null);
  const messageTimerRef = useRef(null);

  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(() => localStorage.getItem("preferredCameraId") || "");
  const [attendanceLogs, setAttendanceLogs] = useState([]);

  // Discover cameras
  useEffect(() => {
    const loadDevices = async () => {
      try {
        if (!navigator.mediaDevices?.enumerateDevices) return;
        const list = await navigator.mediaDevices.enumerateDevices();
        const cams = list.filter((d) => d.kind === "videoinput");
        cams.sort((a, b) => {
          const av = /virtual|phone|obs|snap|nvidia|droidcam|iriun|epoccam|link to windows/i.test(a.label) ? 1 : 0;
          const bv = /virtual|phone|obs|snap|nvidia|droidcam|iriun|epoccam|link to windows/i.test(b.label) ? 1 : 0;
          return av - bv;
        });
        setVideoDevices(cams);
        if (!selectedDeviceId && cams.length) {
          const realCam = cams.find((c) => !/virtual|phone|obs|snap|nvidia|droidcam|iriun|epoccam|link to windows/i.test(c.label)) || cams[0];
          if (realCam?.deviceId) {
            setSelectedDeviceId(realCam.deviceId);
            localStorage.setItem("preferredCameraId", realCam.deviceId);
          }
        }
      } catch (err) {
        console.warn("enumerateDevices failed:", err);
      }
    };
    loadDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", loadDevices);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", loadDevices);
  }, []);

  const handlePickCamera = (e) => {
    const id = e.target.value;
    setSelectedDeviceId(id);
    if (id) localStorage.setItem("preferredCameraId", id);
  };

  // Subscribe to attendance
  useEffect(() => {
    const unsub = db.subscribeAttendance(setAttendanceLogs);
    return () => unsub && unsub();
  }, []);

  // Show message helper
  const showMessage = useCallback((text, duration = 4000) => {
    setMessage(text);
    if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
    messageTimerRef.current = setTimeout(() => setMessage("Scanning Face..."), duration);
  }, []);

  useEffect(() => {
    return () => { if (messageTimerRef.current) clearTimeout(messageTimerRef.current); };
  }, []);

  // Voice announcement
  const speak = useCallback((text) => {
    if (!getSetting("voiceAnnouncements")) return;
    try {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      const synth = window.speechSynthesis;
      synth.resume?.();
      synth.cancel();
      const utter = new window.SpeechSynthesisUtterance(text);
      utter.lang = "en-US";
      utter.rate = 1;
      const voices = voicesRef.current.length ? voicesRef.current : synth.getVoices();
      if (voices?.length) {
        voicesRef.current = voices;
        const preferred = voices.find((v) => /en[-_]US/i.test(v.lang)) || voices.find((v) => /^en/i.test(v.lang)) || voices[0];
        if (preferred) utter.voice = preferred;
      }
      synth.speak(utter);
    } catch (err) {
      console.warn("speak() failed:", err);
    }
  }, []);

  // Audio priming
  useEffect(() => {
    const enableAudio = () => {
      if (audioEnabledRef.current) return;
      try {
        if ("speechSynthesis" in window) {
          const synth = window.speechSynthesis;
          synth.resume?.();
          const warmup = new window.SpeechSynthesisUtterance(" ");
          warmup.volume = 0;
          synth.speak(warmup);
          const cacheVoices = () => { const list = synth.getVoices(); if (list?.length) voicesRef.current = list; };
          cacheVoices();
          synth.onvoiceschanged = cacheVoices;
        }
        if (!audioCtxRef.current) {
          const Ctx = window.AudioContext || window.webkitAudioContext;
          if (Ctx) audioCtxRef.current = new Ctx();
        }
        audioCtxRef.current?.resume?.().catch(() => {});
      } catch (err) {
        console.warn("Failed to prime audio:", err);
      }
      audioEnabledRef.current = true;
      setAudioEnabled(true);
      cleanup();
    };
    const events = ["click", "pointerdown", "touchstart", "keydown", "mousemove"];
    const cleanup = () => events.forEach((ev) => window.removeEventListener(ev, enableAudio));
    const onVisible = () => { if (!document.hidden) enableAudio(); };
    events.forEach((ev) => window.addEventListener(ev, enableAudio, { passive: true }));
    document.addEventListener("visibilitychange", onVisible);
    enableAudio();
    return cleanup;
  }, []);

  // Stop speech on unmount
  useEffect(() => {
    return () => {
      try { window.speechSynthesis?.cancel(); } catch (_) {}
    };
  }, []);

  // Beep helper
  const beep = useCallback((freq = 880, duration = 200, volume = 0.15) => {
    try {
      if (!audioCtxRef.current) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        audioCtxRef.current = new Ctx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = freq;
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(volume, now + 0.01);
      gain.gain.linearRampToValueAtTime(0, now + duration / 1000);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(now);
      oscillator.stop(now + duration / 1000 + 0.02);
    } catch (err) {
      console.warn("beep() failed:", err);
    }
  }, []);

  // Get configurable settings
  const getSettings = () => {
    return loadSettings();
  };

  // FACE LOOP — only start after models are ready
  useEffect(() => {
    if (!modelsReady) {
      setStatus("⏳ Loading AI Models...");
      return;
    }
    setStatus("Waiting for employee...");
    const detectionInterval = getSetting("detectionInterval") || 1500;
    const interval = setInterval(() => {
      if (document.hidden) return;
      detectFace();
    }, detectionInterval);
    return () => clearInterval(interval);
  }, [attendanceLogs, modelsReady]);

  // FACE DETECT
  const detectFace = async () => {
    if (processingRef.current) return;
    processingRef.current = true;

    try {
      const video = webcamRef.current?.video;
      if (!video) { processingRef.current = false; return; }
      if (video.readyState !== 4) {
        setStatus("📷 Starting Camera...");
        processingRef.current = false;
        return;
      }

      const settings = getSettings();

      // DETECT FACE — get landmarks + descriptor in one shot
      const detections = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detections) {
        setStatus("❌ No Face Detected");
        processingRef.current = false;
        return;
      }

      // FACE SIZE CHECK
      const jaw = detections.landmarks.getJawOutline();
      const faceWidth = jaw[16].x - jaw[0].x;

      if (faceWidth < settings.minFaceSize) {
        setStatus(`📵 Face too small (min ${settings.minFaceSize}px)`);
        livenessHistoryRef.current = [];
        livenessFramesRef.current = 0;
        processingRef.current = false;
        return;
      }

      // LIVENESS CHECK
      if (settings.requireLivenessCheck) {
        const noseTip = detections.landmarks.getNose()[3];
        const leftEye = detections.landmarks.getLeftEye();
        const rightEye = detections.landmarks.getRightEye();

        const eyeAspect = (eye) => {
          const vert = (Math.hypot(eye[1].x - eye[5].x, eye[1].y - eye[5].y) + Math.hypot(eye[2].x - eye[4].x, eye[2].y - eye[4].y)) / 2;
          const horiz = Math.hypot(eye[0].x - eye[3].x, eye[0].y - eye[3].y);
          return horiz === 0 ? 0 : vert / horiz;
        };

        const ear = (eyeAspect(leftEye) + eyeAspect(rightEye)) / 2;
        const sample = { noseX: noseTip.x / faceWidth, noseY: noseTip.y / faceWidth, ear, ts: Date.now() };

        const history = livenessHistoryRef.current;
        history.push(sample);
        if (history.length > 5) history.shift();
        livenessFramesRef.current = history.length;

        if (history.length < 2) {
          setStatus("🔎 Verifying you're real... blink or move slightly");
          processingRef.current = false;
          return;
        }

        const range = (arr) => Math.max(...arr) - Math.min(...arr);
        const noseRangeX = range(history.map(h => h.noseX));
        const noseRangeY = range(history.map(h => h.noseY));
        const earRange = range(history.map(h => h.ear));

        const moved = noseRangeX > settings.noseMovementThreshold || noseRangeY > settings.noseMovementThreshold;
        const blinked = earRange > settings.blinkThreshold;

        if (!moved && !blinked) {
          setStatus("📵 Still face — please blink or move slightly");
          processingRef.current = false;
          return;
        }
      }

      setStatus("✅ Real Face Verified");

      // USE DESCRIPTOR from the single detection above (no second camera read)
      const descriptor = detections.descriptor;
      if (!descriptor) {
        setMessage("❌ Face Not Recognized");
        processingRef.current = false;
        return;
      }

      // GET EMPLOYEES
      const employees = await db.getEmployees();
      const matchedEmployee = faceService.matchFace(descriptor, employees);

      if (!matchedEmployee) {
        setMessage("❌ Wrong User Detected");
        processingRef.current = false;
        return;
      }

      // COOLDOWN (from settings)
      const now = Date.now();
      const lastTime = lastDetectionRef.current[matchedEmployee];
      const cooldownMs = (settings.cooldownMinutes || 5) * 60_000;

      if (lastTime && now - lastTime < cooldownMs) {
        const secsLeft = Math.ceil((cooldownMs - (now - lastTime)) / 1000);
        const mins = Math.floor(secsLeft / 60);
        const secs = secsLeft % 60;
        const wait = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
        setMessage(`⏳ ${matchedEmployee} — wait ${wait} before next mark`);
        processingRef.current = false;
        return;
      }

      // TODAY LOGS
      const today = new Date().toLocaleDateString();
      const employeeLogs = attendanceLogs
        .map((log) => ({ ...log, _t: toJsDate(log.time) }))
        .filter((log) => log.name === matchedEmployee && log._t && log._t.toLocaleDateString() === today)
        .sort((a, b) => b._t - a._t);

      const latestRecord = employeeLogs[0];

      // COMPLETED
      if (employeeLogs.length >= 2 && latestRecord?.type === "LOGOUT") {
        showMessage(`✅ ${matchedEmployee} attendance completed`);
        beep(880, 150);
        setTimeout(() => beep(660, 200), 200);
        processingRef.current = false;
        return;
      }

      // LOGIN
      if (!latestRecord) {
        await db.saveAttendance({ name: matchedEmployee, type: "LOGIN", time: new Date() });
        lastDetectionRef.current[matchedEmployee] = Date.now();
        showMessage(`🌟 Welcome ${matchedEmployee}! Have a Productive Day`);
        speak(`Welcome ${matchedEmployee}`);
        processingRef.current = false;
        return;
      }

      // LOGOUT
      if (latestRecord.type === "LOGIN") {
        await db.saveAttendance({ name: matchedEmployee, type: "LOGOUT", time: new Date() });
        lastDetectionRef.current[matchedEmployee] = Date.now();
        showMessage(`🙏 Thank You ${matchedEmployee}! Safe Journey Home`);
        speak(`Thank you ${matchedEmployee}`);
        processingRef.current = false;
        return;
      }

      setMessage(`⏳ ${matchedEmployee} already marked`);

    } catch (error) {
      console.log(error);
    } finally {
      processingRef.current = false;
    }
  };

  const settings = getSettings();

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-white text-gray-800 flex items-center justify-center p-4 md:p-6">
      <div className="w-full max-w-md bg-white rounded-3xl p-6 md:p-8 border border-purple-200 shadow-2xl">

        <h1 className="text-3xl md:text-4xl font-bold text-purple-700 text-center mb-6">
          FACE SCANNER
        </h1>

        <Webcam
          ref={webcamRef}
          audio={false}
          mirrored={settings.mirrorCamera !== false}
          screenshotFormat="image/jpeg"
          key={selectedDeviceId || "default"}
          videoConstraints={
            selectedDeviceId
              ? { deviceId: { exact: selectedDeviceId }, width: settings.cameraWidth || 360, height: settings.cameraHeight || 360 }
              : { width: settings.cameraWidth || 360, height: settings.cameraHeight || 360, facingMode: "user" }
          }
          onUserMedia={() => setStatus("📷 Camera Ready")}
          onUserMediaError={() => setStatus("❌ Camera Access Failed")}
          className="rounded-full border-4 border-purple-500 w-[280px] h-[280px] md:w-[320px] md:h-[320px] object-cover mx-auto shadow-[0_0_40px_rgba(147,51,234,0.35)]"
        />

        {/* Status */}
        <div className="mt-4 text-center">
          <p className="text-lg md:text-xl font-bold text-purple-600">{status}</p>
        </div>

        {/* Camera picker */}
        {videoDevices.length > 1 && (
          <div className="mt-4 text-center">
            <label className="text-gray-400 text-sm mr-2">Camera:</label>
            <select
              value={selectedDeviceId}
              onChange={handlePickCamera}
              className="bg-white border border-purple-400 rounded-xl px-3 py-2 text-sm text-gray-800 max-w-full"
            >
              {videoDevices.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId}>
                  {/virtual|phone|obs|snap|nvidia|droidcam|iriun|epoccam|link to windows/i.test(d.label || "") ? "⚠️ " : "📷 "}
                  {d.label || `Camera ${i + 1}`}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Message */}
        <div className="mt-4 bg-purple-50 border border-purple-300 rounded-2xl p-4 text-center">
          <p className="text-lg md:text-xl font-bold text-gray-800 break-words">{message}</p>
        </div>

      </div>
    </div>
  );
}

export default Camera;