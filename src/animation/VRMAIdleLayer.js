import { VRMAIdleController } from "./VRMAIdleController";

/**
 * VRMA 待机层配置。
 *
 * @typedef {object} VRMAIdleLayerOptions
 * @property {string} [baseActionName] 基础常驻待机动作名称。
 * @property {string[]} [overlaySequence] 待机叠加动作队列。
 * @property {number} [baseWeight] 基础待机层权重。
 * @property {number} [overlayWeight] 叠加待机动作权重。
 * @property {number} [activeOverlayWeight] 前景动作播放时叠加待机动作权重。
 * @property {number} [fadeDuration] 淡入淡出时长，单位秒。
 * @property {number} [startOffset] 叠加动作跳过起始帧的时间，单位秒。
 */

/**
 * 兼容性待机层别名。
 *
 * @class
 * @extends {VRMAIdleController}
 */
export class VRMAIdleLayer extends VRMAIdleController {}

