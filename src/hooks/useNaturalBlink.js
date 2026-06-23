import { useCallback, useEffect, useRef } from "react";

const BLINK_EXPRESSION = "blink";
const DEFAULT_INTERVAL_RANGE = [2.8, 6.5];
const TALKING_INTERVAL_RANGE = [6.0, 11.0];
const CLOSE_DURATION = 0.055;
const HOLD_DURATION = 0.035;
const OPEN_DURATION = 0.12;
const TALKING_THRESHOLD = 0.12;

/**
 * 获取指定范围内的随机数。
 *
 * @param {number} min 最小值。
 * @param {number} max 最大值。
 * @returns {number} 随机数。
 */
const randomBetween = (min, max) => min + Math.random() * (max - min);

/**
 * 二次缓出曲线。
 *
 * @param {number} value 归一化输入值。
 * @returns {number} 曲线输出值。
 */
const easeOutQuad = (value) => 1 - (1 - value) * (1 - value);

/**
 * 二次缓入曲线。
 *
 * @param {number} value 归一化输入值。
 * @returns {number} 曲线输出值。
 */
const easeInQuad = (value) => value * value;

/**
 * 获取下一次眨眼延迟。
 *
 * @param {boolean} isTalking 当前是否处于说话状态。
 * @returns {number} 下一次眨眼延迟，单位秒。
 */
const getNextBlinkDelay = (isTalking) => {
  const [min, max] = isTalking ? TALKING_INTERVAL_RANGE : DEFAULT_INTERVAL_RANGE;
  return randomBetween(min, max);
};

/**
 * 根据眨眼经过时间计算眨眼权重。
 *
 * @param {number} elapsed 当前眨眼已经过时间，单位秒。
 * @returns {number} 眨眼权重。
 */
const getBlinkWeight = (elapsed) => {
  if (elapsed < CLOSE_DURATION) {
    return easeOutQuad(elapsed / CLOSE_DURATION);
  }

  if (elapsed < CLOSE_DURATION + HOLD_DURATION) {
    return 1;
  }

  const openingElapsed = elapsed - CLOSE_DURATION - HOLD_DURATION;
  if (openingElapsed < OPEN_DURATION) {
    return 1 - easeInQuad(openingElapsed / OPEN_DURATION);
  }

  return 0;
};

/**
 * 为 VRM 模型提供自然眨眼控制。
 *
 * @param {object|null} vrm 已加载的 VRM 实例。
 * @param {number} [talkingValue=0] 当前说话强度。
 * @returns {{blinkWeightRef: import("react").MutableRefObject<number>, updateBlink: Function}} 眨眼权重引用和逐帧更新函数。
 */
export default function useNaturalBlink(vrm, talkingValue = 0) {
  const vrmRef = useRef(vrm);
  const blinkWeightRef = useRef(0);
  const nextBlinkAtRef = useRef(0);
  const blinkStartedAtRef = useRef(null);
  const talkingValueRef = useRef(talkingValue);

  useEffect(() => {
    vrmRef.current = vrm;
  }, [vrm]);

  useEffect(() => {
    talkingValueRef.current = talkingValue;
  }, [talkingValue]);

  useEffect(() => {
    nextBlinkAtRef.current = getNextBlinkDelay(false);
    blinkStartedAtRef.current = null;
    blinkWeightRef.current = 0;
  }, [vrm]);

  useEffect(() => {
    return () => {
      vrmRef.current?.expressionManager?.setValue(BLINK_EXPRESSION, 0);
    };
  }, []);

  /**
   * 根据场景运行时间更新眨眼状态。
   *
   * @param {number} elapsedTime 场景运行时间，单位秒。
   * @returns {void}
   */
  const updateBlink = useCallback((elapsedTime) => {
    const isTalking = talkingValueRef.current > TALKING_THRESHOLD;

    if (blinkStartedAtRef.current === null && elapsedTime >= nextBlinkAtRef.current) {
      blinkStartedAtRef.current = elapsedTime;
    }

    if (blinkStartedAtRef.current !== null) {
      const blinkElapsed = elapsedTime - blinkStartedAtRef.current;
      blinkWeightRef.current = getBlinkWeight(blinkElapsed);

      if (blinkWeightRef.current <= 0 && blinkElapsed > CLOSE_DURATION + HOLD_DURATION + OPEN_DURATION) {
        blinkStartedAtRef.current = null;
        nextBlinkAtRef.current = elapsedTime + getNextBlinkDelay(isTalking);
      }
    }

    vrmRef.current?.expressionManager?.setValue(BLINK_EXPRESSION, blinkWeightRef.current);
  }, []);

  return {
    blinkWeightRef,
    updateBlink,
  };
}
