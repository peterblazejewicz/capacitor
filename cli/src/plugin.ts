import { Config } from './config';
import { join, resolve } from 'path';
import { log, readJSON, readXML } from './common';


export const enum PluginType {
  Core,
  Cordova,
  Incompatible
}
export interface PluginManifest {
  ios: {
    src: string;
    doctor?: any[];
  };
  android: {
    src: string;
  };
}

export interface Plugin {
  id: string;
  name: string;
  version: string;
  rootPath: string;
  manifest?: PluginManifest;
  repository?: any;
  xml?: any;
  ios?: {
    name: string;
    type: PluginType;
    path: string;
  };
  android?: {
    type: PluginType;
    path: string
  };
}

export async function getPlugins(config: Config): Promise<Plugin[]> {
  const deps = getDependencies(config);
  const plugins = await Promise.all(deps.map(async p => resolvePlugin(config, p)));
  return plugins.filter(p => !!p) as Plugin[];
}

export async function resolvePlugin(config: Config, name: string): Promise<Plugin | null> {
  try {
    const rootPath = resolve(config.app.rootDir, 'node_modules', name);
    const packagePath = join(rootPath, 'package.json');
    const meta = await readJSON(packagePath);
    if (!meta) {
      return null;
    }
    if (meta.capacitor) {
      let path = rootPath;
      let dep = config.app.package.dependencies[name];
      if (dep && dep.startsWith('file:')) {
        path = config.app.package.dependencies[name].replace('file:', '../../');
      }
      return {
        id: name,
        name: fixName(name),
        version: meta.version,
        rootPath: path,
        repository: meta.repository,
        manifest: meta.capacitor
      };
    }
    const pluginXMLPath = join(rootPath, 'plugin.xml');
    const xmlMeta = await readXML(pluginXMLPath);
    return {
      id: name,
      name: fixName(name),
      version: meta.version,
      rootPath: rootPath,
      repository: meta.repository,
      xml: xmlMeta.plugin
    };
  } catch (e) { }
  return null;
}

export function getDependencies(config: Config): string[] {
  const dependencies = config.app.package.dependencies;
  if (!dependencies) {
    return [];
  }
  return Object.keys(dependencies);
}

export function fixName(name: string): string {
  name = name
    .replace(/\//g, '_')
    .replace(/-/g, '_')
    .replace(/@/g, '')
    .replace(/_\w/g, (m) => m[1].toUpperCase());

  return name.charAt(0).toUpperCase() + name.slice(1);
}


export function printPlugins(plugins: Plugin[], platform: string, type: string = 'capacitor') {
  const plural = plugins.length === 1 ? '' : 's';

  if (type === 'cordova') {
    log(`  Found ${plugins.length} Cordova plugin${plural} for ${platform}`);
  } else if (type === 'incompatible' && plugins.length > 0) {
    log(`  Found ${plugins.length} incompatible Cordova plugin${plural} for ${platform}, skipped install`);
  } else if (type === 'capacitor') {
    log(`  Found ${plugins.length} Capacitor plugin${plural} for ${platform}:`);
  }
  const chalk = require('chalk');
  for (let p of plugins) {
    log(`    ${chalk.bold(`${p.name}`)} (${chalk.green(p.version)})`);
  }
}

export function getPluginPlatform(p: Plugin, platform: string) {
  const platforms = p.xml.platform;
  if (platforms) {
    const platforms = p.xml.platform.filter(function(item: any) { return item.$.name === platform; });
    return platforms[0];
  }
  return null;
}

export function getPlatformElement(p: Plugin, platform: string, elementName: string) {
  const platformTag = getPluginPlatform(p, platform);
  if (platformTag) {
    const element = platformTag[elementName];
    if (element) {
      return element;
    }
  }
  return [];
}

export function getPluginType(p: Plugin, platform: string): PluginType {
  if (platform === 'ios') {
    return p.ios!.type;
  }
  if (platform === 'android') {
    return p.android!.type;
  }
  return PluginType.Core;
}

/**
 * Get each JavaScript Module for the given plugin
 */
export function getJSModules(p: Plugin, platform: string) {
  return getAllElements(p, platform, 'js-module');
}

export function getFilePath(config: Config, plugin: Plugin, path: string) {
  if (path.startsWith("node_modules")) {
    return join(config.app.rootDir, path);
  }
  return join(plugin.rootPath, path);
}

/**
 * For a given plugin, return all the plugin.xml elements with elementName, checking root and specified platform
 */
export function getAllElements(p: Plugin, platform: string, elementName: string) {
  let modules: Array<string> = [];
  if (p.xml[elementName]) {
    modules = modules.concat(p.xml[elementName]);
  }
  const platformModules = getPluginPlatform(p, platform);
  if (platformModules && platformModules[elementName]) {
    modules = modules.concat(platformModules[elementName]);
  }
  return modules;
}