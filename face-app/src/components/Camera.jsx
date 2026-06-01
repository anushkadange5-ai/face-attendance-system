import Webcam from "react-webcam";
import * as faceapi from "face-api.js";

import {
  useRef,
  useEffect,
  useState,
  useCallback,
} from "react";

import { faceService } from "../faceService";
import { db } from "../db";
import { toJsDate, toTimeString } from "../utils/time";

function Camera() {

  const webcamRef =
    useRef(null);

  // PROCESS LOCK 😎

  const processingRef =
    useRef(false);

  // LIVENESS TRACKING 😎
  // Real humans have natural micro-movements + blinks; a phone photo
  // (or printed photo) stays static. We sample a few signals across
  // recent frames and require at least one to change meaningfully.

  const livenessHistoryRef = useRef([]); // [{ noseX, noseY, ear, ts }]
  const livenessFramesRef  = useRef(0);  // frames currently collected

  const [message, setMessage] =
    useState(
      "Scanning Face..."
    );

  const [status, setStatus] =
    useState(
      "Waiting for employee..."
    );

  // ATTENDANCE LIVE FROM FIRESTORE (single source of truth)

  const [attendanceLogs, setAttendanceLogs] = useState([]);

  const [lastDetection, setLastDetection] = useState({});

  useEffect(() => {

    const unsub = db.subscribeAttendance(setAttendanceLogs);
    return () => unsub && unsub();

  }, []);

  // AUTO-CLEAR MESSAGE HELPER 😎
  // Shows a message and auto-resets it to the default after `duration` ms

  const messageTimerRef = useRef(null);

  const showMessage = useCallback((text, duration = 4000) => {

    setMessage(text);

    if (messageTimerRef.current) {
      clearTimeout(messageTimerRef.current);
    }

    messageTimerRef.current = setTimeout(() => {
      setMessage("Scanning Face...");
      messageTimerRef.current = null;
    }, duration);

  }, []);

  // cleanup pending timer when component unmounts
  useEffect(() => {
    return () => {
      if (messageTimerRef.current) {
        clearTimeout(messageTimerRef.current);
      }
    };
  }, []);

  // VOICE ANNOUNCEMENT HELPER 🔊
  // Uses Web Speech API (window.speechSynthesis) — works in Chrome, Edge,
  // Safari. Falls back silently if unsupported or blocked by the browser.

  const speak = useCallback((text) => {

    try {

      // Feature detection
      if (
        typeof window === "undefined" ||
        !("speechSynthesis" in window) ||
        typeof window.SpeechSynthesisUtterance !== "function"
      ) {
        console.warn("SpeechSynthesis not supported in this browser");
        return;
      }

      const synth = window.speechSynthesis;

      // Cancel any queued / in-progress speech so we never overlap
      // (also prevents the same phrase from repeating during a re-scan)
      synth.cancel();

      const utter = new window.SpeechSynthesisUtterance(text);
      utter.lang = "en-US";
      utter.rate = 1;
      utter.pitch = 1;
      utter.volume = 1;

      // Graceful error handler (e.g. autoplay/permission blocks on
      // some browsers until the user has interacted with the page)
      utter.onerror = (e) => {
        console.warn("SpeechSynthesis error:", e?.error || e);
      };

      synth.speak(utter);

    } catch (err) {
      // Never let TTS failures break the attendance flow
      console.warn("speak() failed:", err);
    }

  }, []);

  // Stop any pending speech when leaving the page
  useEffect(() => {
    return () => {
      try {
        if (
          typeof window !== "undefined" &&
          window.speechSynthesis
        ) {
          window.speechSynthesis.cancel();
        }
      } catch (_) {
        /* ignore */
      }
    };
  }, []);

  // BEEP HELPER 🔔
  // Generates a short beep using the Web Audio API (no audio file
  // needed). Used to notify when an action is rejected, e.g. when a
  // user's attendance is already complete for the day.

  const audioCtxRef = useRef(null);

  const beep = useCallback((freq = 880, duration = 200, volume = 0.15) => {

    try {

      // Lazy-create a single AudioContext (browsers limit how many you
      // can have). Created on first call which happens after a user
      // interaction has already enabled the page, so autoplay policies
      // are satisfied.
      if (!audioCtxRef.current) {
        const Ctx =
          window.AudioContext || window.webkitAudioContext;
        if (!Ctx) {
          console.warn("Web Audio API not supported");
          return;
        }
        audioCtxRef.current = new Ctx();
      }

      const ctx = audioCtxRef.current;

      // Resume context if it was suspended by the browser
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }

      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      oscillator.type = "sine";
      oscillator.frequency.value = freq;

      // Quick fade-in / fade-out to avoid a "click" sound
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(volume, now + 0.01);
      gain.gain.linearRampToValueAtTime(0, now + duration / 1000);

      oscillator.connect(gain);
      gain.connect(ctx.destination);

      oscillator.start(now);
      oscillator.stop(now + duration / 1000 + 0.02);

    } catch (err) {
      // Never let audio failures break the attendance flow
      console.warn("beep() failed:", err);
    }

  }, []);

  // FACE LOOP 😎

  useEffect(() => {

    const interval =
      setInterval(() => {

        if (
          document.hidden
        ) return;

        detectFace();

      }, 3000);

    return () =>
      clearInterval(
        interval
      );

  }, [attendanceLogs]);

  // FACE DETECT 😎

  const detectFace =
    async () => {

      // PREVENT MULTIPLE RUN 😎

      if (
        processingRef.current
      )
        return;

      processingRef.current =
        true;

      try {

        const video =
          webcamRef.current
            ?.video;

        if (!video) {

          processingRef.current =
            false;

          return;

        }

        // CAMERA READY

        if (
          video.readyState !==
          4
        ) {

          setStatus(
            "📷 Starting Camera..."
          );

          processingRef.current =
            false;

          return;

        }

        // DETECT FACE

        const detections =
          await faceapi
            .detectSingleFace(
              video,
              new faceapi.TinyFaceDetectorOptions()
            )
            .withFaceLandmarks();

        // NO FACE

        if (
          !detections
        ) {

          setStatus(
            "❌ No Face Detected"
          );

          processingRef.current =
            false;

          return;

        }

        // FACE SIZE 😎

        const jaw =
          detections.landmarks.getJawOutline();

        const faceWidth =
          jaw[16].x -
          jaw[0].x;

        // SMALL FACE  (likely a phone held far / printed photo) 😎

        if (faceWidth < 120) {

          setStatus("📵 Mobile / Fake Face Detected");

          // reset history so next attempt starts fresh
          livenessHistoryRef.current = [];
          livenessFramesRef.current  = 0;

          processingRef.current = false;
          return;

        }

        // LIVENESS CHECK 😎  (anti-spoofing for phone/printed photos)
        //
        // 1) Track nose tip position + Eye Aspect Ratio (EAR) over the
        //    last ~6 frames (~18 sec at the 3-sec interval).
        // 2) Real person → nose drifts a few pixels (head micro-motion)
        //    and EAR changes when blinking.
        // 3) Static phone photo → nose stays exact, EAR is constant.

        const noseTip   = detections.landmarks.getNose()[3];   // tip of nose
        const leftEye   = detections.landmarks.getLeftEye();
        const rightEye  = detections.landmarks.getRightEye();

        // Eye Aspect Ratio  (vertical openness / horizontal width)
        const eyeAspect = (eye) => {
          const vert =
            (Math.hypot(eye[1].x - eye[5].x, eye[1].y - eye[5].y) +
             Math.hypot(eye[2].x - eye[4].x, eye[2].y - eye[4].y)) / 2;
          const horiz =
            Math.hypot(eye[0].x - eye[3].x, eye[0].y - eye[3].y);
          return horiz === 0 ? 0 : vert / horiz;
        };

        const ear = (eyeAspect(leftEye) + eyeAspect(rightEye)) / 2;

        // Normalize movement by face width so it's distance-independent
        const sample = {
          noseX: noseTip.x / faceWidth,
          noseY: noseTip.y / faceWidth,
          ear,
          ts: Date.now(),
        };

        const history = livenessHistoryRef.current;
        history.push(sample);
        // keep only last 6 samples
        if (history.length > 6) history.shift();
        livenessFramesRef.current = history.length;

        // Need at least 3 samples before we can judge
        if (history.length < 3) {
          setStatus(
            `🔎 Liveness check... (${history.length}/3)`
          );
          processingRef.current = false;
          return;
        }

        // Compute deltas across history
        const noseXs = history.map((h) => h.noseX);
        const noseYs = history.map((h) => h.noseY);
        const ears   = history.map((h) => h.ear);

        const range = (arr) => Math.max(...arr) - Math.min(...arr);

        const noseRangeX = range(noseXs);   // ~0.01-0.05 for real, ~0 for photo
        const noseRangeY = range(noseYs);
        const earRange   = range(ears);     // blink causes a spike

        const moved   = noseRangeX > 0.01 || noseRangeY > 0.01;
        const blinked = earRange > 0.06;

        if (!moved && !blinked) {

          setStatus("📵 Mobile / Fake Face Detected");

          processingRef.current = false;
          return;

        }

        setStatus("✅ Real Face Verified");

        // GET DESCRIPTOR

        const descriptor =
          await faceService.getFaceDescriptor(
            video
          );

        if (
          !descriptor
        ) {

          setMessage(
            "❌ Face Not Recognized"
          );

          processingRef.current =
            false;

          return;

        }

        // GET EMPLOYEES 😎

        const employees =
          await db.getEmployees();

        // MATCH FACE 😎

        const matchedEmployee =
          faceService.matchFace(
            descriptor,
            employees
          );

        // UNKNOWN USER 😎

        if (
          !matchedEmployee
        ) {

          setMessage(
            "❌ Wrong User Detected"
          );

          processingRef.current =
            false;

          return;

        }

        // COOLDOWN 😎

        const now =
          new Date();

        const lastTime =
          lastDetection[
            matchedEmployee
          ];

        const cooldown =
          30000;

        if (
          lastTime &&
          now - new Date(lastTime) < cooldown
        ) {

          setMessage(
            `⏳ ${matchedEmployee} already marked`
          );

          processingRef.current =
            false;

          return;

        }

        // TODAY LOGS 😎

        const today =
          new Date().toLocaleDateString();

        const employeeLogs =
          attendanceLogs
            .map((log) => ({ ...log, _t: toJsDate(log.time) }))
            .filter(
              (log) =>
                log.name === matchedEmployee &&
                log._t &&
                log._t.toLocaleDateString() === today
            );

        // SORT LATEST FIRST 😎

        employeeLogs.sort((a, b) => b._t - a._t);

        // LATEST RECORD 😎

        const latestRecord =
          employeeLogs[0];

        // COMPLETED 😎  (already LOGIN + LOGOUT done for today)

        if (
          employeeLogs.length >= 2 &&
          latestRecord?.type === "LOGOUT"
        ) {

          showMessage(
            `✅ ${matchedEmployee} attendance completed`
          );

          // Short double beep so the user audibly knows we recognized
          // them but cannot mark attendance again today.
          beep(880, 150);
          setTimeout(() => beep(660, 200), 200);

          processingRef.current = false;
          return;

        }

        // LOGIN 😎

        if (
          !latestRecord
        ) {

          await db.saveAttendance({
            name: matchedEmployee,
            type: "LOGIN",
            time: new Date(),
          });

          // Firestore subscription will auto-update attendanceLogs

          setLastDetection(
            (prev) => ({

              ...prev,

              [matchedEmployee]:
                new Date(),

            })
          );

          showMessage(
            `🌟 Welcome ${matchedEmployee}! Have a Productive Day`
          );

          // Voice announcement (only once per successful LOGIN)
          speak(`Welcome ${matchedEmployee}`);

          processingRef.current =
            false;

          return;

        }

        // LOGOUT 😎

        if (
          latestRecord.type ===
          "LOGIN"
        ) {

          await db.saveAttendance({
            name: matchedEmployee,
            type: "LOGOUT",
            time: new Date(),
          });

          // Firestore subscription will auto-update attendanceLogs

          setLastDetection(
            (prev) => ({

              ...prev,

              [matchedEmployee]:
                new Date(),

            })
          );

          showMessage(
            `🙏 Thank You ${matchedEmployee}! Safe Journey Home`
          );

          // Voice announcement (only once per successful LOGOUT)
          speak(`Thank you ${matchedEmployee}`);

          processingRef.current =
            false;

          return;

        }

        setMessage(
          `⏳ ${matchedEmployee} already marked`
        );

      } catch (error) {

        console.log(
          error
        );

      } finally {

        processingRef.current =
          false;

      }

    };
    const todayDateStr = new Date().toLocaleDateString();
    const todayLogs = attendanceLogs
      .map((log) => ({ ...log, _t: toJsDate(log.time) }))
      .filter(
        (log) => log._t && log._t.toLocaleDateString() === todayDateStr
      )
      .sort((a, b) => b._t - a._t);

  return (

    <div className="min-h-screen bg-black text-white p-8">

      <div className="grid md:grid-cols-2 gap-10">

        {/* CAMERA */}

        <div className="bg-[#111] rounded-3xl p-8 border border-green-500/20">

          <h1 className="text-5xl font-bold text-green-400 mb-8">

            FACE SCANNER

          </h1>

          <Webcam
            ref={webcamRef}
            audio={false}
            mirrored={true}
            screenshotFormat="image/jpeg"

            videoConstraints={{
              width: 300,
              height: 300,
              facingMode: "user",
            }}

            onUserMedia={() => {

              setStatus(
                "📷 Camera Ready"
              );

            }}

            onUserMediaError={() => {

              setStatus(
                "❌ Camera Access Failed"
              );

            }}

            className="rounded-full border-4 border-green-500 w-[300px] h-[300px] object-cover mx-auto shadow-[0_0_30px_rgba(34,197,94,0.35)]"
          />

          {/* STATUS */}

          <div className="mt-5 text-center">

            <h1 className="text-2xl font-bold text-yellow-400">

              {status}

            </h1>

          </div>

          {/* MESSAGE */}

          <div className="mt-6 bg-black border border-green-500 rounded-2xl p-6 text-center">

            <h1 className="text-3xl font-bold">

              {message}

            </h1>

          </div>

        </div>

        {/* LOGS */}

       <div className="bg-[#111] rounded-[40px] p-6 border border-green-500/20">

          <div className="flex justify-between items-center mb-8">

            <h1 className="text-5xl font-bold text-green-400">

              Attendance Logs

            </h1>

            <p className="text-gray-400 text-xl">

              {
                todayLogs.length
              }{" "}
              entries today

            </p>

          </div>

          <div className="space-y-4">

            {todayLogs.map(
              (
                log,
                index
              ) => (

                <div
                  key={
                    index
                  }
                  className="bg-black border border-green-500/20 rounded-2xl p-5 flex justify-between items-center"
                >

                  <div>

                    <h1 className="text-3xl font-bold">

                      {
                        log.name
                      }

                    </h1>

                    <p className="text-gray-400">

                      {log._t ? log._t.toLocaleDateString() : ""}

                    </p>

                  </div>

                  <div className="text-right">

                    <div
                      className={`px-5 py-2 rounded-xl text-xl font-bold mb-2 ${
                        log.type ===
                        "LOGIN"
                          ? "bg-green-500/20 text-green-400"
                          : "bg-red-500/20 text-red-400"
                      }`}
                    >

                      {
                        log.type
                      }

                    </div>

                    <p className="text-xl">

                      {log._t ? log._t.toLocaleTimeString() : ""}

                    </p>

                  </div>

                </div>

              )
            )}

          </div>

        </div>

      </div>

    </div>

  );

}

export default Camera;