import { startDriver, stopDriver, APP_BINARY, DRIVER_PORT } from './helpers/app';

// Mỗi spec chạy tuần tự (maxInstances 1) với một thư mục dữ liệu tạm riêng và tauri-driver riêng.
// Thư mục dữ liệu nằm trong thư mục tạm của hệ điều hành, không bao giờ là dữ liệu thật.
export const config = {
  runner: 'local',
  specs: ['./specs/**/*.e2e.ts'],
  maxInstances: 1,
  hostname: '127.0.0.1',
  port: DRIVER_PORT,
  path: '/',
  capabilities: [
    {
      browserName: 'wry',
      'tauri:options': { application: APP_BINARY },
    },
  ],
  logLevel: 'warn',
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: { ui: 'bdd', timeout: 90_000 },
  beforeSession: async () => {
    await startDriver();
  },
  afterSession: () => {
    stopDriver();
  },
} as unknown as WebdriverIO.Config;
