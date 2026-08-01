import { AnimationLayerController } from "./AnimationLayerController";
import { VRMAIdleController } from "./VRMAIdleController";
import { VRMA_ACTIONS, VRMAActionController } from "./VRMAActionController";

/**
 * VRMA 动作系统配置。
 *
 * @typedef {object} VRMAActionSystemOptions
 * @property {import("./VRMAIdleController").VRMAIdleControllerOptions} [idle] 待机配置。
 */

/**
 * VRMA 动作系统控制器。
 *
 * @class
 */
export class VRMAActionSystem {
  constructor(vrm, options = {}) {
    this.actionController = new VRMAActionController(vrm, options);
    this.layerController = new AnimationLayerController(this.actionController);
    this.idleLayer = new VRMAIdleController(this.actionController, VRMA_ACTIONS, options.idle);
    this.layerController.registerLayer("idle", this.idleLayer);
  }

  registerLayer(layerName, layer, definition) {
    this.layerController.registerLayer(layerName, layer, definition);
    return this;
  }

  registerLayers(definitions) {
    this.layerController.registerLayers(definitions);
    return this;
  }

  getLayer(layerName) {
    return this.layerController.getLayer(layerName);
  }

  setLayerWeight(layerName, weight, fadeDuration) {
    this.layerController.setLayerWeight(layerName, weight, fadeDuration);
    return this;
  }

  enableLayer(layerName) {
    this.layerController.enableLayer(layerName);
    return this;
  }

  disableLayer(layerName, fadeDuration) {
    this.layerController.disableLayer(layerName, fadeDuration);
    return this;
  }

  setAudioLevel(level) {
    this.actionController.setAudioLevel(level);
    return this;
  }

  update(delta) {
    this.actionController.update(delta);
    return this;
  }

  startIdle(options) {
    this.layerController.startLayer("idle", options);
    return this;
  }

  stopIdle(fadeDuration) {
    this.layerController.stopLayer("idle", fadeDuration);
    return this;
  }

  restoreIdle(fadeDuration) {
    this.idleLayer.restore(fadeDuration);
    return this;
  }

  playAction(actionName, options) {
    return this.idleLayer.enabled
      ? this.playActionWithIdle(actionName, options)
      : this.actionController.playAction(actionName, options);
  }

  playActionWithIdle(actionName, options = {}) {
    const wasEnabled = this.idleLayer.enabled;
    this.idleLayer.enterForeground(options.fadeDuration);

    return this.actionController
      .playAction(actionName, {
        ...options,
        stopOthers: options.stopOthers ?? false,
      })
      .finally(() => {
        if (wasEnabled) {
          this.idleLayer.exitForeground(options.fadeDuration);
        }
      });
  }

  blendActions(targetWeights, options) {
    this.idleLayer.duck();
    return this.actionController.blend(targetWeights, options);
  }

  stopActions(fadeDuration) {
    this.actionController.stopAll(fadeDuration);
    this.idleLayer.restore(fadeDuration);
  }

  dispose() {
    this.layerController.dispose();
    this.idleLayer.dispose();
    this.actionController.dispose();
  }
}

export const createVRMAActionSystem = (vrm, options) => new VRMAActionSystem(vrm, options);
