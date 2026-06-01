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

  // AUDIO ENABLED 🔊
  // Browsers block speech/audio until the user has interacted with
  // the page (Chrome/Edge autoplay policy). We flip this true on the
  // first interaction OR when the user clicks the "Enable Voice" button.

  const [audioEnabled, setAudioEnabled] = useState(false);
  const audioEnabledRef = useRef(false);   // ref for callbacks
  const voicesRef       = useRef([]);      // cached SpeechSynthesis voices

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

      // Autoplay-policy guard: Chrome/Edge silently swallow speech
      // until the user has interacted with the page at least once.
      if (!audioEnabledRef.current) {
        console.warn(
          "Voice skipped: click anywhere on the page or hit the " +
          "'Enable Voice' button once so the browser allows audio."
        );
        return;
      }

      const synth = window.speechSynthesis;

      // Cancel any queued / in-progress speech so we never overlap
      // (also prevents the same phrase from repeating during a re-scan)
      synth.cancel();

      const utter = new window.SpeechSynthesisUtterance(text);
      utter.lang   = "en-US";
      utter.rate   = 1;
      utter.pitch  = 1;
      utter.volume = 1;

      // Pick a real English voice if we have one cached
      const voices = voicesRef.current;
      if (voices && voices.length) {
        const preferred =
          voices.find((v) => /en[-_]US/i.test(v.lang)) ||
          voices.find((v) => /^en/i.test(v.lang)) ||
          voices[0];
        if (preferred) utter.voice = preferred;
      }

      utter.onerror = (e) => {
        console.warn("SpeechSynthesis error:", e?.error || e);
      };

      synth.speak(utter);
      console.log("🔊 speak:", text);

    } catch (err) {
      // Never let TTS failures break the attendance flow
      console.warn("speak() failed:", err);
    }

  }, []);

  // Prime audio + load voices on the FIRST user interaction.
  // Most browsers require a real user gesture before any sound
  // (TTS or Web Audio) is allowed to play.

  useEffect(() => {

    const enableAudio = () => {

      if (audioEnabledRef.current) return;

      try {

        // 1) Unlock SpeechSynthesis by speaking a silent utterance
        if ("speechSynthesis" in window) {
          const synth = window.speechSynthesis;
          // resume() is a no-op if already running
          synth.resume?.();
          const warmup = new window.SpeechSynthesisUtterance(" ");
          warmup.volume = 0;
          synth.speak(warmup);

          // Cache voices (they load asynchronously in Chrome)
          const cacheVoices = () => {
            const list = synth.getVoices();
            if (list && list.length) {
              voicesRef.current = list;
            }
          };
          cacheVoices();
          synth.onvoiceschanged = cacheVoices;
        }

        // 2) Unlock Web Audio (used by beep())
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
      console.log("🔊 Audio enabled");

    };

    // Any of these counts as a user gesture
    const events = ["click", "touchstart", "keydown", "pointerdown"];
    events.forEach((ev) =>
      window.addEventListener(ev, enableAudio, { once: true, passive: true })
    );

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, enableAudio));
    };

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

  // FACE LOOP 😎  (faster polling so liveness samples build up quickly)

  useEffect(() => {

    const interval = setInterval(() => {

      if (document.hidden) return;

      detectFace();

    }, 1500);

    return () => clearInterval(interval);

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

        if (faceWidth < 100) {

          setStatus("📵 Face too small — move closer");

          // reset history so next attempt starts fresh
          livenessHistoryRef.current = [];
          livenessFramesRef.current  = 0;

          processingRef.current = false;
          return;

        }

        // LIVENESS CHECK 😎  (anti-spoofing for phone/printed photos)
        //
        // 1) Track nose tip position + Eye Aspect Ratio (EAR) over the
        //    last few frames.
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
        // keep only last 5 samples
        if (history.length > 5) history.shift();
        livenessFramesRef.current = history.length;

        // Need at least 2 samples before we can judge
        if (history.length < 2) {
          setStatus("🔎 Verifying you're real... blink or move slightly");
          processingRef.current = false;
          return;
        }

        // Compute deltas across history
        const noseXs = history.map((h) => h.noseX);
        const noseYs = history.map((h) => h.noseY);
        const ears   = history.map((h) => h.ear);

        const range = (arr) => Math.max(...arr) - Math.min(...arr);

        const noseRangeX = range(noseXs);
        const noseRangeY = range(noseYs);
        const earRange   = range(ears);

        // Much more lenient thresholds — even tiny natural motion
        // counts as alive. A truly static photo still produces 0.
        const moved   = noseRangeX > 0.003 || noseRangeY > 0.003;
        const blinked = earRange > 0.03;

        console.log(
          "Liveness:",
          { noseRangeX: noseRangeX.toFixed(4),
            noseRangeY: noseRangeY.toFixed(4),
            earRange:   earRange.toFixed(4),
            moved, blinked }
        );

        if (!moved && !blinked) {

          setStatus("📵 Still face — please blink or move slightly");

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

          {/* ENABLE VOICE BUTTON */}

          {!audioEnabled && (
            <button
              onClick={() => {
                try {
                  if ("speechSynthesis" in window) {
                    const synth = window.speechSynthesis;
                    synth.resume?.();
                    const u = new window.SpeechSynthesisUtterance("Voice enabled");
                    u.volume = 1;
                    synth.speak(u);
                    voicesRef.current = synth.getVoices();
                  }
                  if (!audioCtxRef.current) {
                    const Ctx = window.AudioContext || window.webkitAudioContext;
                    if (Ctx) audioCtxRef.current = new Ctx();
                  }
                  audioCtxRef.current?.resume?.().catch(() => {});
                } catch (e) {
                  console.warn("Enable Voice failed:", e);
                }
                audioEnabledRef.current = true;
                setAudioEnabled(true);
              }}
              className="mt-4 w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3 rounded-2xl text-xl"
            >
              🔊 Enable Voice
            </button>
          )}

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