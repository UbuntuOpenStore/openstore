import type { Apparmor, Desktop } from './schemas';

export type { Apparmor };

export interface Hooks {
  desktop?: string;
  apparmor?: string;
  'content-hub'?: string;
  urls?: string;
  'push-helper'?: string;
  'account-service'?: string;
  'account-application'?: string;
  [key: string]: string | undefined;
}

export interface QmlImport {
  module: string;
  version?: string;
}

export class App {
  name: string;
  type: 'app' | 'webapp' | 'push';
  features: string[];
  desktop: Desktop;
  apparmor: Apparmor;
  contentHub: Record<string, string[]>;
  urlDispatcher: Array<Record<string, string>>;
  pushHelper: Record<string, string>;
  accountService: Record<string, unknown>;
  accountApplication: Record<string, unknown>;
  webappProperties: Record<string, unknown>;
  webappInject: boolean;
  webappUrl?: string;
  hooks: Hooks;
  qmlImports: QmlImport[];

  constructor(name: string, hooks: Hooks) {
    this.name = name;
    this.type = 'app';
    if (hooks['push-helper']) {
      this.type = 'push';
    }

    this.features = [];
    const desktop: Desktop = {};
    this.desktop = desktop;
    const apparmor: Apparmor = {};
    this.apparmor = apparmor;
    this.contentHub = {};
    this.urlDispatcher = [];
    this.pushHelper = {};
    this.accountService = {};
    this.accountApplication = {};
    this.webappProperties = {};
    this.webappInject = false;
    this.webappUrl = undefined;
    this.hooks = hooks;
    this.qmlImports = [];
  }
}
