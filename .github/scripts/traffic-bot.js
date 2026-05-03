const https = require('https');
const http = require('http');
const { URL } = require('url');

class TraffiKingSafeZone {
    constructor() {
        this.blogUrl = process.env.BLOG_URL || 'https://allai-info.blogspot.com';
        this.accountName = process.env.ACCOUNT_NAME || 'UNKNOWN';
        this.sessions = parseInt(process.env.SESSIONS || '10');
        this.pagesPerSession = parseInt(process.env.PAGES_PER_SESSION || '3');
        this.minReadTime = parseInt(process.env.MIN_READ_TIME || '20');
        this.maxReadTime = parseInt(process.env.MAX_READ_TIME || '45');
        this.adClickChance = parseInt(process.env.AD_CLICK_CHANCE || '35');
        
        this.posts = [];
        this.stats = {
            total: 0,
            success: 0,
            failed: 0,
            adClicks: 0,
            adImpressions: 0,
            uniquePosts: new Set()
        };
        
        this.startTime = Date.now();
    }

    log(message) {
        console.log(`[${new Date().toISOString()}] ${message}`);
    }

    async httpRequest(url, options = {}) {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const protocol = urlObj.protocol === 'https:' ? https : http;
            
            const requestOptions = {
                hostname: urlObj.hostname,
                port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
                path: urlObj.pathname + urlObj.search,
                method: options.method || 'GET',
                headers: options.headers || {},
                timeout: options.timeout || 12000
            };

            const req = protocol.request(requestOptions, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve({
                    status: res.statusCode,
                    data: data,
                    headers: res.headers
                }));
            });

            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Timeout'));
            });

            req.end();
        });
    }

    async fetchBlogPosts() {
        this.log(`📚 Fetching posts from ${this.blogUrl}...`);

        try {
            const feedUrl = `${this.blogUrl}/feeds/posts/default?alt=json&max-results=50`;
            const response = await this.httpRequest(feedUrl, { timeout: 10000 });
            
            if (response.status === 200) {
                const data = JSON.parse(response.data);
                const entries = data.feed.entry || [];
                
                this.posts = entries.map(entry => {
                    const links = entry.link || [];
                    const alternateLink = links.find(l => l.rel === 'alternate');
                    return alternateLink ? alternateLink.href : null;
                }).filter(url => url !== null);

                this.log(`✅ Found ${this.posts.length} posts`);
            }
        } catch (error) {
            this.log(`⚠️ Feed error, using homepage`);
            this.posts = [this.blogUrl];
        }

        if (this.posts.length === 0) {
            this.posts = [this.blogUrl];
        }
    }

    getRandomItem(array) {
        return array[Math.floor(Math.random() * array.length)];
    }

    getRandomUserAgent() {
        const agents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile Safari/604.1',
            'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
        ];
        return this.getRandomItem(agents);
    }

    getReferrer() {
        const referrers = [
            'https://www.google.com/search?q=ai+news',
            'https://www.google.com/search?q=artificial+intelligence',
            'https://www.google.com/',
            'https://www.facebook.com/',
            'https://twitter.com/',
            ''
        ];
        return this.getRandomItem(referrers);
    }

    detectAndSimulateAds(html) {
        const adPatterns = [
            /adsterra/gi,
            /atdmt\.com/gi,
            /adsense/gi
        ];

        let adCount = 0;
        for (const pattern of adPatterns) {
            const matches = html.match(pattern);
            if (matches) adCount += matches.length;
        }

        if (adCount > 0) {
            this.stats.adImpressions += adCount;
            
            // Conservative ad clicking (35% chance)
            if (Math.random() * 100 < this.adClickChance) {
                const clicks = Math.min(Math.floor(Math.random() * 2) + 1, adCount);
                this.stats.adClicks += clicks;
                this.log(`🎯 Ad interaction: ${clicks} click(s)`);
            }
        }
    }

    async visitPage(url) {
        const userAgent = this.getRandomUserAgent();
        const referrer = this.getReferrer();

        const headers = {
            'User-Agent': userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': referrer,
            'DNT': '1',
            'Connection': 'keep-alive'
        };

        try {
            const startTime = Date.now();
            const response = await this.httpRequest(url, { headers, timeout: 12000 });
            const responseTime = Date.now() - startTime;

            if (response.status >= 200 && response.status < 400) {
                this.stats.success++;
                this.stats.total++;
                this.stats.uniquePosts.add(url);

                this.detectAndSimulateAds(response.data);

                const readTime = (this.minReadTime + 
                    Math.random() * (this.maxReadTime - this.minReadTime)) * 1000;
                
                const postName = url.split('/').pop().substring(0, 25);
                this.log(`✅ ${postName}... (${responseTime}ms) - ${(readTime/1000).toFixed(1)}s`);

                await this.sleep(readTime);
                return true;
            } else {
                this.stats.failed++;
                this.stats.total++;
                return false;
            }
        } catch (error) {
            this.stats.failed++;
            this.stats.total++;
            return false;
        }
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async runSession(sessionNumber) {
        this.log(`\n📱 Session ${sessionNumber}/${this.sessions}`);

        for (let page = 1; page <= this.pagesPerSession; page++) {
            const postUrl = this.getRandomItem(this.posts);
            await this.visitPage(postUrl);

            if (page < this.pagesPerSession) {
                await this.sleep(Math.random() * 3000 + 2000);
            }
        }

        if (sessionNumber < this.sessions) {
            const delay = Math.random() * 20000 + 15000;
            await this.sleep(delay);
        }
    }

    async run() {
        this.log('═══════════════════════════════════════════');
        this.log(`👑 TraffiKing Safe Zone - ${this.accountName} Account`);
        this.log('═══════════════════════════════════════════');
        this.log(`📝 Blog: ${this.blogUrl}`);
        this.log(`📊 Config: ${this.sessions} sessions × ${this.pagesPerSession} pages`);
        this.log(`⏱️  Read: ${this.minReadTime}-${this.maxReadTime}s/page`);
        this.log(`🎯 Ad click: ${this.adClickChance}%`);
        this.log('═══════════════════════════════════════════\n');

        await this.fetchBlogPosts();

        for (let i = 1; i <= this.sessions; i++) {
            try {
                await this.runSession(i);
            } catch (error) {
                this.log(`⚠️ Session ${i} error: ${error.message}`);
            }
        }

        this.printStats();
    }

    printStats() {
        const duration = ((Date.now() - this.startTime) / 60000).toFixed(1);
        const successRate = this.stats.total > 0 ? 
            ((this.stats.success / this.stats.total) * 100).toFixed(1) : 0;
        const ctr = this.stats.adImpressions > 0 ?
            ((this.stats.adClicks / this.stats.adImpressions) * 100).toFixed(1) : 0;

        this.log('\n═══════════════════════════════════════════');
        this.log(`🎉 ${this.accountName} Account - Session Complete!`);
        this.log('═══════════════════════════════════════════');
        this.log(`⏱️  Duration: ${duration} minutes`);
        this.log(`📊 Views: ${this.stats.success}/${this.stats.total} (${successRate}%)`);
        this.log(`📝 Unique posts: ${this.stats.uniquePosts.size}`);
        this.log(`👁️  Impressions: ${this.stats.adImpressions}`);
        this.log(`🎯 Clicks: ${this.stats.adClicks} (${ctr}% CTR)`);
        this.log('═══════════════════════════════════════════\n');
    }
}

const bot = new TraffiKingSafeZone();
bot.run().then(() => {
    process.exit(0);
}).catch(error => {
    console.error('❌ Error:', error.message);
    process.exit(1);
});
