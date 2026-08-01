import * as THREE from "three";

/**
 * VRMA 待机控制器配置。
 *
 * @typedef {object} VRMAIdleControllerOptions
 * @property {string} [baseActionName] 基础常驻待机动作名称。
 * @property {string[]} [overlaySequence] 待机叠加动作队列。
 * @property {number} [baseWeight] 基础待机层权重。
 * @property {number} [overlayWeight] 叠加待机动作权重。
 * @property {number} [activeOverlayWeight] 前景动作播放时叠加待机动作权重。
 * @property {number} [fadeDuration] 淡入淡出时长，单位秒。
 * @property {number} [startOffset] 叠加动作跳过起始帧的时间，单位秒。
 */

const DEFAULT_BASE_IDLE_ACTION = "idle_loop";
const DEFAULT_OVERLAY_IDLE_SEQUENCE = [""];
const DEFAULT_BASE_WEIGHT = 1;
const DEFAULT_OVERLAY_WEIGHT = 0.65;
const ACTIVE_OVERLAY_WEIGHT = 0.42;
const DEFAULT_FADE_DURATION = 0.35;
const DEFAULT_START_OFFSET = 0.12;

/**
 * 管理 VRMA 的基础常驻待机层和待机叠加动作队列。
 *
 * @class
 */
export class VRMAIdleController {
  constructor(actionController, actions, options = {}) {
    this.actionController = actionController;
    this.actions = actions;
    this.baseActionName = options.baseActionName ?? DEFAULT_BASE_IDLE_ACTION;
    this.overlaySequence = options.overlaySequence ?? DEFAULT_OVERLAY_IDLE_SEQUENCE;
    this.baseWeight = options.baseWeight ?? DEFAULT_BASE_WEIGHT;
    this.overlayWeight = options.overlayWeight ?? DEFAULT_OVERLAY_WEIGHT;
    this.activeOverlayWeight = options.activeOverlayWeight ?? ACTIVE_OVERLAY_WEIGHT;
    this.fadeDuration = options.fadeDuration ?? DEFAULT_FADE_DURATION;
    this.startOffset = options.startOffset ?? DEFAULT_START_OFFSET;
    this.enabled = false;
    this.token = 0;
    this.overlayIndex = 0;
    this.currentOverlayActionName = null;
    this.transitionTimer = null;
    this.foregroundActionCount = 0;
  }

  start(options = {}) {
    this.enabled = true;
    this.token += 1;
    this.clearTransitionTimer();

    if (options.baseActionName) this.baseActionName = options.baseActionName;
    if (options.sequence) {
      this.overlaySequence = options.sequence;
      this.overlayIndex = 0;
    }
    if (options.baseWeight != null) this.baseWeight = options.baseWeight;
    if (options.overlayWeight != null) this.overlayWeight = options.overlayWeight;

    this.preload();
    this.startBaseIdle();
    this.playNextOverlay(this.token);
    return this;
  }

  stop(fadeDuration = this.fadeDuration) {
    this.enabled = false;
    this.token += 1;
    this.clearTransitionTimer();

    if (this.currentOverlayActionName) {
      this.actionController.stop(this.currentOverlayActionName, fadeDuration);
      this.currentOverlayActionName = null;
    }

    if (this.baseActionName) {
      this.actionController.stop(this.baseActionName, fadeDuration);
    }

    return this;
  }

  enterForeground(fadeDuration = this.fadeDuration) {
    this.foregroundActionCount += 1;
    this.duck(fadeDuration);
  }

  exitForeground(fadeDuration = this.fadeDuration) {
    this.foregroundActionCount = Math.max(0, this.foregroundActionCount - 1);

    if (this.enabled && this.foregroundActionCount === 0) {
      this.restore(fadeDuration);
    }
  }

  duck(fadeDuration = this.fadeDuration) {
    this.setOverlayWeight(this.activeOverlayWeight, fadeDuration);
  }

  restore(fadeDuration = this.fadeDuration) {
    this.startBaseIdle();
    this.setOverlayWeight(this.overlayWeight, fadeDuration);

    if (!this.currentOverlayActionName) {
      this.playNextOverlay(this.token);
    }
  }

  preload() {
    const actionNames = [this.baseActionName, ...this.getOverlayActions()].filter(Boolean);
    Promise.all(actionNames.map((actionName) => this.actionController.getAction(actionName))).catch(
      () => {}
    );
  }

  async startBaseIdle() {
    if (!this.enabled || !this.actions[this.baseActionName]) return;

    const action = await this.actionController.getAction(this.baseActionName);
    if (!this.enabled) return;

    action.reset();
    action.enabled = true;
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
    action.setEffectiveWeight(this.baseWeight);
    action.fadeIn(this.fadeDuration);
    action.play();
    this.actionController.activeActions.set(this.baseActionName, action);
  }

  getOverlayActions() {
    return this.overlaySequence.filter(
      (actionName) => actionName !== this.baseActionName && this.actions[actionName]
    );
  }

  getNextOverlayActionName() {
    const overlayActions = this.getOverlayActions();
    if (overlayActions.length === 0) return null;

    const actionName = overlayActions[this.overlayIndex % overlayActions.length];
    this.overlayIndex += 1;
    return actionName;
  }

  async playNextOverlay(token) {
    if (!this.enabled || token !== this.token) return;

    const actionName = this.getNextOverlayActionName();
    if (!actionName) return;

    const previousOverlayActionName = this.currentOverlayActionName;
    this.currentOverlayActionName = actionName;
    const action = await this.actionController.getAction(actionName);

    if (!this.enabled || token !== this.token) return;

    const weight =
      this.foregroundActionCount > 0 ? this.activeOverlayWeight : this.overlayWeight;

    action.reset();
    action.enabled = true;
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.time = Math.min(this.startOffset, Math.max(0, action.getClip().duration - 0.01));
    action.setEffectiveWeight(weight);
    action.fadeIn(this.fadeDuration);
    action.play();
    this.actionController.activeActions.set(actionName, action);
    this.preloadNextOverlay();

    if (previousOverlayActionName && previousOverlayActionName !== actionName) {
      this.actionController.stop(previousOverlayActionName, this.fadeDuration);
    }

    this.scheduleNextOverlay(token, action);
  }

  scheduleNextOverlay(token, action) {
    this.clearTransitionTimer();

    const durationLeft = Math.max(0, action.getClip().duration - action.time);
    const transitionDelay = Math.max(
      0,
      (durationLeft - this.fadeDuration) / Math.abs(action.timeScale || 1)
    );

    this.transitionTimer = globalThis.setTimeout(() => {
      if (!this.enabled || token !== this.token) return;

      this.playNextOverlay(token);
    }, transitionDelay * 1000);
  }

  preloadNextOverlay() {
    const overlayActions = this.getOverlayActions();
    if (overlayActions.length === 0) return;

    const actionName = overlayActions[this.overlayIndex % overlayActions.length];
    this.actionController.getAction(actionName).catch(() => {});
  }

  setOverlayWeight(weight, fadeDuration = this.fadeDuration) {
    if (!this.currentOverlayActionName) return;

    const action = this.actionController.actions.get(this.currentOverlayActionName);
    action?.fadeIn(fadeDuration);
    action?.setEffectiveWeight(weight);
  }

  clearTransitionTimer() {
    if (!this.transitionTimer) return;

    globalThis.clearTimeout(this.transitionTimer);
    this.transitionTimer = null;
  }

  dispose() {
    this.stop(0);
  }
}

