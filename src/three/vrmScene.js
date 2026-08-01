import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";

const BACKGROUND_COLOR = 0xf5f5f5;
const CAMERA_TARGET = new THREE.Vector3(0, 0.85, 0);
const MODEL_POSITION = new THREE.Vector3(0, -0.15, 0);

/**
 * 创建用于显示 VRM 的透视相机。
 *
 * @returns {THREE.PerspectiveCamera} 已设置位置和朝向的相机。
 */
const createCamera = () => {
  const camera = new THREE.PerspectiveCamera(
    35,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );

  camera.position.set(0, 1.15, 3.2);
  camera.lookAt(CAMERA_TARGET);

  return camera;
};

/**
 * 创建 WebGL 渲染器。
 *
 * @returns {THREE.WebGLRenderer} 已配置像素比、尺寸和色彩空间的渲染器。
 */
const createRenderer = () => {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;

  return renderer;
};

/**
 * 为场景添加基础面光源和环境光。
 *
 * @param {THREE.Scene} scene 需要添加灯光的 Three.js 场景。
 * @returns {void}
 */
const addAreaLighting = (scene) => {
  RectAreaLightUniformsLib.init();

  const ambientLight = new THREE.AmbientLight(0xffffff, 1.8);
  scene.add(ambientLight);

  const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0xd8d8d8, 1.2);
  scene.add(hemisphereLight);

  const keyLight = new THREE.RectAreaLight(0xffffff, 12, 4.0, 3.0);
  keyLight.position.set(0, 1.6, 1.6);
  keyLight.lookAt(0, 1.25, 0);
  scene.add(keyLight);

  const fillLight = new THREE.RectAreaLight(0xffffff, 5, 3.0, 2.4);
  fillLight.position.set(-1.6, 1.25, 1.2);
  fillLight.lookAt(0, 1.2, 0);
  scene.add(fillLight);

  const rimLight = new THREE.RectAreaLight(0xffffff, 3, 2.4, 2.8);
  rimLight.position.set(1.8, 1.8, -1.8);
  rimLight.lookAt(0, 1.35, 0);
  scene.add(rimLight);
};

/**
 * 创建支持 VRM 插件的 GLTF 加载器。
 *
 * @returns {GLTFLoader} 已注册 VRM 插件的 GLTF 加载器。
 */
const createVRMLoader = () => {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  return loader;
};

/**
 * 加载 VRM 模型文件。
 *
 * @param {GLTFLoader} loader GLTF 加载器。
 * @param {string} url VRM 模型 URL。
 * @returns {Promise<object>} 已加载的 VRM 实例。
 */
const loadVRM = (loader, url) =>
  new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        const vrm = gltf.userData.vrm;

        if (!vrm) {
          reject(new Error(`VRM model not found: ${url}`));
          return;
        }

        vrm.scene.position.copy(MODEL_POSITION);
        vrm.scene.rotation.y = Math.PI;
        resolve(vrm);
      },
      undefined,
      reject
    );
  });

/**
 * 创建 VRM 场景控制对象。
 *
 * @param {HTMLElement} container 渲染器 DOM 挂载容器。
 * @param {string} vrmUrl VRM 模型 URL。
 * @returns {{loadModel: Function, getDelta: Function, getElapsedTime: Function, render: Function, dispose: Function}} VRM 场景控制对象。
 */
export const createVRMScene = (container, vrmUrl) => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND_COLOR);

  const camera = createCamera();
  const renderer = createRenderer();
  const clock = new THREE.Clock();
  const loader = createVRMLoader();
  let currentVrm = null;
  let isDisposed = false;

  addAreaLighting(scene);
  container.appendChild(renderer.domElement);

  /**
   * 渲染当前场景。
   *
   * @returns {void}
   */
  const render = () => {
    renderer.render(scene, camera);
  };

  /**
   * 获取上一帧到当前帧的时间差。
   *
   * @returns {number} 时间差，单位秒。
   */
  const getDelta = () => clock.getDelta();

  /**
   * 获取场景运行总时长。
   *
   * @returns {number} 已运行时间，单位秒。
   */
  const getElapsedTime = () => clock.elapsedTime;

  /**
   * 加载并添加 VRM 模型到场景。
   *
   * @returns {Promise<object>} 已加载的 VRM 实例。
   */
  const loadModel = async () => {
    if (isDisposed) {
      return null;
    }

    if (currentVrm) {
      scene.remove(currentVrm.scene);
      VRMUtils.deepDispose(currentVrm.scene);
      currentVrm = null;
    }

    const vrm = await loadVRM(loader, vrmUrl);

    if (isDisposed) {
      VRMUtils.deepDispose(vrm.scene);
      return null;
    }

    scene.add(vrm.scene);
    currentVrm = vrm;
    return vrm;
  };

  /**
   * 释放场景渲染器资源。
   *
   * @returns {void}
   */
  const dispose = () => {
    isDisposed = true;

    if (currentVrm) {
      scene.remove(currentVrm.scene);
      VRMUtils.deepDispose(currentVrm.scene);
      currentVrm = null;
    }

    scene.traverse((object) => {
      if (object.isLight || object.isCamera) return;
      if (object.geometry) object.geometry.dispose?.();
      if (Array.isArray(object.material)) {
        for (const material of object.material) material.dispose?.();
      } else {
        object.material?.dispose?.();
      }
    });

    if (renderer.domElement.parentNode === container) {
      container.removeChild(renderer.domElement);
    }
    renderer.dispose();
    loader.dispose?.();
  };

  return {
    loadModel,
    getDelta,
    getElapsedTime,
    render,
    dispose,
  };
};
