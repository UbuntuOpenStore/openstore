export interface Hooks {
  desktop?: string;
  apparmor?: string;
  'content-hub'?: string;
  urls?: string;
  'push-helper'?: string;
  'account-service'?: string;
  'account-application'?: string;
  scope?: string;
  [key: string]: string | undefined;
}

export interface Apparmor {
  policy_groups?: string[];
  policy_version?: number;
  template?: string;
  write_path?: string[];
  read_path?: string[];
}

export interface QmlImport {
  module: string;
  version: string | null;
}

export class App {
  name: string;
  type: string;
  features: string[];
  desktop: Record<string, string>;
  scopeIni: Record<string, string>;
  apparmor: Apparmor;
  contentHub: Record<string, string[]>;
  urlDispatcher: Array<Record<string, string>>;
  pushHelper: Record<string, string>;
  accountService: Record<string, unknown>;
  accountApplication: Record<string, unknown>;
  webappProperties: Record<string, unknown>;
  webappInject: boolean;
  webappUrl: string | null;
  hooks: Hooks;
  qmlImports: QmlImport[];

  constructor(name: string, hooks: Hooks) {
    this.name = name;
    this.type = 'app'; // app, webapp, scope, push, webapp+
    this.features = [];
    this.desktop = {};
    this.scopeIni = {};
    this.apparmor = {};
    this.contentHub = {};
    this.urlDispatcher = [];
    this.pushHelper = {};
    this.accountService = {};
    this.accountApplication = {};
    this.webappProperties = {};
    this.webappInject = false;
    this.webappUrl = null;
    this.hooks = hooks;
    this.qmlImports = [];
  }
}
