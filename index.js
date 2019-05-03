/**
 * Copyright 2019 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
const puppeteer = require('puppeteer');
const carlo = require('carlo');
const path = require('path');
const {snapshot} = require('./accessibility');
const {createJSHandle} = require('puppeteer/lib/JSHandle');
const prependHttp = require('prepend-http');

const appPromise = carlo.launch({
  executablePath: puppeteer.executablePath()
}).then(async app => {
  app.serveFolder(path.resolve(__dirname, 'www'));
  await app.exposeFunction('snapshot', async() => {
    const page = await pagePromise;
    return await snapshot(page);
  });
  await app.exposeFunction('$eval', async(backendNodeId, func, ...args) => {
    const page = await pagePromise;
    const {object} = await page._client.send('DOM.resolveNode', {backendNodeId});
    const handle = createJSHandle(await page.mainFrame().executionContext(), object);
    const dummy = () => void 0;
    dummy.toString = () => func;
    return await page.evaluate(dummy, handle, ...args);
  });
  await app.exposeFunction('keypress', async key => {
    const page = await pagePromise;
    await page.keyboard.press(key);
  });
  await app.exposeFunction('changeURL', async url => {
    const page = await pagePromise;
    await page.goto(prependHttp(url));
  });
  await app.exposeFunction('goForward', async url => {
    const page = await pagePromise;
    await page.goForward();
  });
  await app.exposeFunction('goBack', async url => {
    const page = await pagePromise;
    await page.goBack();
  });
  await app.load('index.html');
  app.on('exit', () => process.exit());
  return app;
});
if (process.argv.some(x => x === '--help')) {
  console.log('Usage: node [--show] [url]');
  process.exit(0);
}
const headless = !process.argv.some(x => x === '--show');
const pagePromise = puppeteer.launch({
  headless,
  defaultViewport: headless ? {width: 1920, height: 1080} : null,
  ignoreDefaultArgs: headless ? [] : ['--enable-automation'],
  args: ['--no-default-browser-check'],
  env: {
    GOOGLE_API_KEY: 'no',
    GOOGLE_DEFAULT_CLIENT_ID: 'no',
    GOOGLE_DEFAULT_CLIENT_SECRET: 'no',
    ...process.env
  }
}).then(async browser => {
  const [page] = await browser.pages();
  page.on('framenavigated', async frame => {
    if (frame.parentFrame())
      return;
    const app = await appPromise;
    app.evaluate(url => {
      urlChanged(url);
      render();
    }, page.url());
  });
  page.on('load', async() => {
    const app = await appPromise;
    app.evaluate(() => render());
  });
  page.on('domcontentloaded', async() => {
    const app = await appPromise;
    app.evaluate(() => render());
  });
  const urls = process.argv.slice(2).map(x => x.trim()).filter(x => x && !x.startsWith('--'));
  const url = urls.length ? prependHttp(urls[0]) : 'https://www.google.com';
  await page.goto(url);
  await page._client.send('Accessibility.enable');
  await page._client.send('Emulation.setFocusEmulationEnabled', {enabled: true});

  return page;
});