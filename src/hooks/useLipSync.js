import { useEffect, useRef, useCallback, useState } from "react";

const MOUTH_EXPRESSION = "aa";
const SILENCE_THRESHOLD = 0.01;
const VOLUME_GAIN = 18;
const MOUTH_OPEN_SPEED = 0.65;
const MOUTH_CLOSE_SPEED = 0.3;
const audioGraphs = new WeakMap();

const getAudioGraph = (mediaElement) => {
  let graph = audioGraphs.get(mediaElement);

  if (!graph) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioContextClass();
    graph = {
      audioContext,
      source: audioContext.createMediaElementSource(mediaElement),
    };
    audioGraphs.set(mediaElement, graph);
  }

  return graph;
};

/**
 * Hook that connects an HTMLMediaElement's audio output to a VRM model,
 * analyzing volume and automatically driving the "aa" mouth expression.
 *
 * Usage:
 *   useLipSync(vrm, audioElement);
 *
 * The hook starts an internal animation loop that reads volume from
 * the analyser and applies it to vrm.expressionManager each frame.
 */
export default function useLipSync(vrm, mediaElement) {
  const [mouthValue, setVisibleMouthValue] = useState(0);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const rafIdRef = useRef(null);
  const mouthValueRef = useRef(0);

  const setMouthValue = useCallback(
    (value) => {
      mouthValueRef.current = value;
      setVisibleMouthValue(value);
      vrm?.expressionManager?.setValue(MOUTH_EXPRESSION, value);
    },
    [vrm]
  );

  const disconnect = useCallback(() => {
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }
    setMouthValue(0);
    dataArrayRef.current = null;
  }, [setMouthValue]);

  useEffect(() => {
    if (!vrm || !mediaElement) return;

    const { audioContext, source } = getAudioGraph(mediaElement);
    audioContextRef.current = audioContext;

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.65;
    analyserRef.current = analyser;

    const dataArray = new Uint8Array(analyser.fftSize);
    dataArrayRef.current = dataArray;

    // Source → analyser → destination (audio still plays out loud)
    source.connect(analyser);
    analyser.connect(audioContext.destination);

    const resumeAudioContext = () => {
      if (audioContext.state === "suspended") {
        audioContext.resume();
      }
    };

    const resetMouth = () => setMouthValue(0);

    mediaElement.addEventListener("play", resumeAudioContext);
    mediaElement.addEventListener("pause", resetMouth);
    mediaElement.addEventListener("ended", resetMouth);

    // Animation loop: read RMS volume → smooth → drive VRM expression each frame
    const update = () => {
      rafIdRef.current = requestAnimationFrame(update);

      if (mediaElement.paused || mediaElement.ended || audioContext.state !== "running") {
        setMouthValue(0);
        return;
      }

      analyser.getByteTimeDomainData(dataArray);

      let sumSquares = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const centeredSample = (dataArray[i] - 128) / 128;
        sumSquares += centeredSample * centeredSample;
      }

      const rms = Math.sqrt(sumSquares / dataArray.length);
      const normalizedVolume = Math.max(0, rms - SILENCE_THRESHOLD);
      const targetMouthValue = Math.min(normalizedVolume * VOLUME_GAIN, 1);
      const smoothing =
        targetMouthValue > mouthValueRef.current
          ? MOUTH_OPEN_SPEED
          : MOUTH_CLOSE_SPEED;
      const mouthValue =
        mouthValueRef.current +
        (targetMouthValue - mouthValueRef.current) * smoothing;

      setMouthValue(mouthValue);
    };

    update();

    return () => {
      mediaElement.removeEventListener("play", resumeAudioContext);
      mediaElement.removeEventListener("pause", resetMouth);
      mediaElement.removeEventListener("ended", resetMouth);
      disconnect();
    };
  }, [mediaElement, disconnect, setMouthValue, vrm]);

  return { disconnect, mouthValue };
}
