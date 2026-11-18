import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests/e2e',timeout:40000,workers:1,fullyParallel:false,use:{baseURL:'http://127.0.0.1:4173',viewport:{width:1280,height:1000},launchOptions:{chromiumSandbox:true}},webServer:{command:'pnpm dev:demo',url:'http://127.0.0.1:4173',reuseExistingServer:!process.env.CI},reporter:'list'});
