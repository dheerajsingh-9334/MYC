const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('response', response => {
    if (response.url().includes('/api/tasks')) {
      console.log('Response:', response.url(), response.status());
    }
  });

  await page.goto('http://localhost:3000/login');
  await page.type('input[type="email"]', 'dheeraj@automationschool.in');
  await page.type('input[type="password"]', '12345678');
  await page.click('button[type="submit"]');
  await page.waitForNavigation();

  await page.goto('http://localhost:3000/tasks');
  await page.waitForSelector('.kanban-board'); // wait for something?
  // wait for 2 seconds
  await new Promise(r => setTimeout(r, 2000));
  console.log("Logged in and on tasks page");
  
  await browser.close();
})();
