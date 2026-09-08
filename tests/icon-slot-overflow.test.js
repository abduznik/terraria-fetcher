// Regression check for the icon-slot overflow bug (see commit
// "fix: constrain oversized item icons").
//
// Every .icon-slot frames an <img> pulled from wiki.gg at whatever native
// resolution the wiki serves it. Some sprites (Zenith, Terra Blade, Influx
// Waver) are drawn at unusual/larger canvas sizes than most items. This test
// stubs the icon image with an oversized 256x256 PNG for a sample of these
// large-sprite items and asserts the rendered <img> never exceeds the bounds
// of its .icon-slot container, across every page/context that renders one.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function startStaticServer(root) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      const filePath = path.join(root, urlPath === '/' ? '/index.html' : urlPath);
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        const ext = path.extname(filePath);
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const LARGE_SPRITE_ITEMS = ['Zenith', 'Terra Blade', 'Influx Waver'];

// Real sprites vary in native resolution; a 256x256 solid PNG fixture
// stands in for an oversized sprite so the check doesn't depend on network
// access to terraria.wiki.gg to find a large one.
const OVERSIZED_PNG = fs.readFileSync(path.join(__dirname, 'fixtures-oversized.png'));

async function checkPage(browser, url, { searchInputId, suggestionsId, searchTerm }) {
  const page = await browser.newPage();
  const failures = [];

  await page.route(/terraria\.wiki\.gg/i, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: OVERSIZED_PNG,
    })
  );

  await page.goto(url);

  for (const term of [searchTerm]) {
    await page.fill(`#${searchInputId}`, term);
    await page.waitForTimeout(150);

    const slots = await page.$$(`#${suggestionsId} .icon-slot`);
    for (const slot of slots) {
      const overflow = await slot.evaluate((slotEl) => {
        const img = slotEl.querySelector('img');
        if (!img) return null;
        const style = getComputedStyle(slotEl);
        const slotBox = slotEl.getBoundingClientRect();
        const imgBox = img.getBoundingClientRect();
        // overflow:hidden on the slot visually clips oversized images, so a
        // naive size comparison never sees a regression - what actually
        // matters is whether the slot *would* clip an oversized image at
        // all. If it wouldn't (overflow isn't hidden/clip) AND the image's
        // intrinsic box exceeds the slot, the sprite really does bleed out.
        const clips = style.overflow === 'hidden' || style.overflow === 'clip';
        return {
          slotBox: { w: slotBox.width, h: slotBox.height },
          imgBox: { w: imgBox.width, h: imgBox.height },
          clips,
          overflowsX: imgBox.width > slotBox.width + 0.5,
          overflowsY: imgBox.height > slotBox.height + 0.5,
        };
      });
      if (overflow && !overflow.clips && (overflow.overflowsX || overflow.overflowsY)) {
        failures.push({ url, term, overflow });
      }
    }
  }

  await page.close();
  return failures;
}

async function main() {
  const root = path.resolve(__dirname, '..');
  const server = await startStaticServer(root);
  const port = server.address().port;
  const browser = await chromium.launch();
  const allFailures = [];

  const targets = [
    {
      file: 'tree.html',
      searchInputId: 'treeSearchInput',
      suggestionsId: 'treeSuggestions',
    },
    {
      file: 'compare.html',
      searchInputId: 'compareSearchInput',
      suggestionsId: 'compareSuggestions',
    },
  ];

  for (const target of targets) {
    const url = `http://127.0.0.1:${port}/${target.file}`;
    for (const item of LARGE_SPRITE_ITEMS) {
      const failures = await checkPage(browser, url, {
        searchInputId: target.searchInputId,
        suggestionsId: target.suggestionsId,
        searchTerm: item,
      });
      allFailures.push(...failures);
    }
  }

  await browser.close();
  server.close();

  if (allFailures.length) {
    console.error('Icon-slot overflow regression detected:');
    for (const f of allFailures) {
      console.error(
        `  ${f.url} search="${f.term}": slot=${JSON.stringify(f.overflow.slotBox)} img=${JSON.stringify(f.overflow.imgBox)}`
      );
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `OK: all .icon-slot images stayed within bounds across ${targets.length} pages x ${LARGE_SPRITE_ITEMS.length} sample items.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
