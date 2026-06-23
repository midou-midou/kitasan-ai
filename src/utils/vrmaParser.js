import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMAnimationLoaderPlugin } from "@pixiv/three-vrm-animation";

const vrmaCache = new Map();

/**
 * 创建支持 VRMA 动画插件的 GLTF 加载器。
 *
 * @returns {GLTFLoader} 已注册 VRMA 动画插件的 GLTF 加载器。
 */
const createVRMALoader = () => {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
  return loader;
};

/**
 * 使用 GLTF 加载器加载指定 URL。
 *
 * @param {GLTFLoader} loader GLTF 加载器。
 * @param {string} url 资源 URL。
 * @returns {Promise<object>} GLTF 加载结果。
 */
const loadGLTF = (loader, url) =>
  new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });

/**
 * 解析 VRMA 文件并返回 VRM 动画数据。
 *
 * @param {string} url VRMA 文件 URL。
 * @returns {Promise<object>} VRM 动画数据。
 */
export const parseVRMA = async (url) => {
  if (!vrmaCache.has(url)) {
    vrmaCache.set(
      url,
      loadGLTF(createVRMALoader(), url).then((gltf) => {
        const vrmAnimation = gltf.userData.vrmAnimations?.[0];

        if (!vrmAnimation) {
          throw new Error(`VRMA animation not found: ${url}`);
        }

        return vrmAnimation;
      })
    );
  }

  return vrmaCache.get(url);
};

/**
 * 清空 VRMA 解析缓存。
 *
 * @returns {void}
 */
export const clearVRMACache = () => {
  vrmaCache.clear();
};
