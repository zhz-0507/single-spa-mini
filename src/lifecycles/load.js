import {
  LOAD_ERROR,
  NOT_BOOTSTRAPPED,
  LOADING_SOURCE_CODE,
  SKIP_BECAUSE_BROKEN,
  NOT_LOADED,
  objectType,
  toName,
} from "../applications/app.helpers.js";
import { ensureValidAppTimeouts } from "../applications/timeouts.js";
import {
  handleAppError,
  formatErrorMessage,
} from "../applications/app-errors.js";
import {
  flattenFnArray,
  smellsLikeAPromise,
  validLifecycleFn,
} from "./lifecycle.helpers.js";
import { getProps } from "./prop.helpers.js";
import { assign } from "../utils/assign.js";

// 通过微任务去加载子应用
// return了一个promise出来，然后.then去注册微任务
export function toLoadPromise(app) {
  return Promise.resolve().then(() => {
    if (app.loadPromise) {
      // 说明已经加载过了
      return app.loadPromise;
    }
    // app.stauts 不为NOT_LOADED和LOAD_ERROR才可以被加载
    if (app.status !== NOT_LOADED && app.status !== LOAD_ERROR) {
      return app;
    }
    // 设置app的状态
    app.status = LOADING_SOURCE_CODE;

    let appOpts, isUserErr;

    return (app.loadPromise = Promise.resolve()
      .then(() => {
        // 执行app加载函数，并给子应用传递props => 用户自定义的customProps和内置的singleSPA实例，应用名称
        const loadPromise = app.loadApp(getProps(app));
        // 加载函数需要返回一个promise
        if (!smellsLikeAPromise(loadPromise)) {
          // The name of the app will be prepended to this error message inside of the handleAppError function
          isUserErr = true;
          throw Error(
            formatErrorMessage(
              33,
              __DEV__ &&
                `single-spa loading function did not return a promise. Check the second argument to registerApplication('${toName(
                  app
                )}', loadingFunction, activityFunction)`,
              toName(app)
            )
          );
        }
        // 这个val就是示例项目中加载函数中return出来的window.singleSpa，这个属性是子应用打包时设置的
        return loadPromise.then((val) => {
          app.loadErrorTime = null;

          appOpts = val;
          // 简称g.s

          let validationErrMessage, validationErrCode;
          // 必须是对象
          if (typeof appOpts !== "object") {
            validationErrCode = 34;
            if (__DEV__) {
              validationErrMessage = `does not export anything`;
            }
          }
          // g.s导出的时候必须有bootstrap生命周期
          if (
            // ES Modules don't have the Object prototype
            Object.prototype.hasOwnProperty.call(appOpts, "bootstrap") &&
            !validLifecycleFn(appOpts.bootstrap)
          ) {
            validationErrCode = 35;
            if (__DEV__) {
              validationErrMessage = `does not export a valid bootstrap function or array of functions`;
            }
          }
          // g.s必须导出mount生命周期函数
          if (!validLifecycleFn(appOpts.mount)) {
            validationErrCode = 36;
            if (__DEV__) {
              validationErrMessage = `does not export a mount function or array of functions`;
            }
          }
          // g.s必须导出unmount生命周期函数
          if (!validLifecycleFn(appOpts.unmount)) {
            validationErrCode = 37;
            if (__DEV__) {
              validationErrMessage = `does not export a unmount function or array of functions`;
            }
          }

          const type = objectType(appOpts);
          // 说明上述验证失败，抛出错误信息
          if (validationErrCode) {
            let appOptsStr;
            try {
              appOptsStr = JSON.stringify(appOpts);
            } catch {}
            console.error(
              formatErrorMessage(
                validationErrCode,
                __DEV__ &&
                  `The loading function for single-spa ${type} '${toName(
                    app
                  )}' resolved with the following, which does not have bootstrap, mount, and unmount functions`,
                type,
                toName(app),
                appOptsStr
              ),
              appOpts
            );
            handleAppError(validationErrMessage, app, SKIP_BECAUSE_BROKEN);
            return app;
          }

          if (appOpts.devtools && appOpts.devtools.overlays) {
            app.devtools.overlays = assign(
              {},
              app.devtools.overlays,
              appOpts.devtools.overlays
            );
          }
          // 设置app状态，表明加载完成
          app.status = NOT_BOOTSTRAPPED;
          // 在app对象上挂载生命周期方法，每个方法都接受一个props作为参数，方法内部执行子应用的生命周期
          app.bootstrap = flattenFnArray(appOpts, "bootstrap");
          app.mount = flattenFnArray(appOpts, "mount");
          app.unmount = flattenFnArray(appOpts, "unmount");
          app.unload = flattenFnArray(appOpts, "unload");
          app.timeouts = ensureValidAppTimeouts(appOpts.timeouts);

          // 这里说明子应用已经加载成功，删除app.loadPromise
          delete app.loadPromise;

          return app;
        });
      })
      .catch((err) => {
        // 加载失败，会重新加载
        delete app.loadPromise;

        let newStatus;
        if (isUserErr) {
          newStatus = SKIP_BECAUSE_BROKEN;
        } else {
          newStatus = LOAD_ERROR;
          app.loadErrorTime = new Date().getTime();
        }
        handleAppError(err, app, newStatus);

        return app;
      }));
  });
}
