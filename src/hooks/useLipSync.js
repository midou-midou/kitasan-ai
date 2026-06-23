import { useEffect, useRef, useCallback, useState } from "react";

const MOUTH_EXPRESSION = "aa";
const SILENCE_THRESHOLD = 0.01;
const VOLUME_GAIN = 18;
const MOUTH_OPEN_SPEED = 0.65;
const MOUTH_CLOSE_SPEED = 0.3;
const audioGraphs = new WeakMap();

/**
 * 获取或创建音频分析图。
 *
 * @param {HTMLMediaElement} mediaElement 需要分析的媒体元素。
 * @returns {{audioContext: AudioContext, source: MediaElementAudioSourceNode}} 音频上下文和媒体源节点。
 */
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
 * 将音频输出连接到 VRM 模型并驱动嘴型表情。
 *
 * @param {object|null} vrm 已加载的 VRM 实例。
 * @param {HTMLMediaElement|null} mediaElement 需要分析的音频元素。
 * @returns {{disconnect: Function, mouthValue: number}} 断开函数和当前嘴型权重。
 */
export default function useLipSync(vrm, mediaElement) {
  const [mouthValue, setVisibleMouthValue] = useState(0);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const rafIdRef = useRef(null);
  const mouthValueRef = useRef(0);

  /**
   * 设置当前嘴型权重并同步到 VRM 表情。
   *
   * @param {number} value 嘴型权重。
   * @returns {void}
   */
  const setMouthValue = useCallback(
    (value) => {
      mouthValueRef.current = value;
      setVisibleMouthValue(value);
      vrm?.expressionManager?.setValue(MOUTH_EXPRESSION, value);
    },
    [vrm]
  );

  /**
   * 断开音频分析器并重置嘴型。
   *
   * @returns {void}
   */
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

    /**
     * 恢复处于暂停状态的 AudioContext。
     *
     * @returns {void}
     */
    const resumeAudioContext = () => {
      if (audioContext.state === "suspended") {
        audioContext.resume();
      }
    };

    /**
     * 将嘴型重置为闭合状态。
     *
     * @returns {void}
     */
    const resetMouth = () => setMouthValue(0);

    mediaElement.addEventListener("play", resumeAudioContext);
    mediaElement.addEventListener("pause", resetMouth);
    mediaElement.addEventListener("ended", resetMouth);

    /**
     * 逐帧读取 RMS 音量并平滑驱动嘴型。
     *
     * @returns {void}
     */
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
