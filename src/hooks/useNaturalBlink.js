import { useCallback, useEffect, useRef } from "react";

const BLINK_EXPRESSION = "blink";
const DEFAULT_INTERVAL_RANGE = [2.8, 6.5];
const TALKING_INTERVAL_RANGE = [6.0, 11.0];
const CLOSE_DURATION = 0.055;
const HOLD_DURATION = 0.035;
const OPEN_DURATION = 0.12;
const TALKING_THRESHOLD = 0.12;

const randomBetween = (min, max) => min + Math.random() * (max - min);

const easeOutQuad = (value) => 1 - (1 - value) * (1 - value);

const easeInQuad = (value) => value * value;

const getNextBlinkDelay = (isTalking) => {
  const [min, max] = isTalking ? TALKING_INTERVAL_RANGE : DEFAULT_INTERVAL_RANGE;
  return randomBetween(min, max);
};

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
