// TEMPORARY DIAGNOSTIC surface: this cache id is also shown in Settings → Account → Sync diagnostics.
const APP_SHELL_VERSION='build148-v296';
const CACHE_PREFIX='klabs-studio-app-shell-';
const CACHE=`${CACHE_PREFIX}${APP_SHELL_VERSION}`;
const LEGACY_CACHE_PREFIX='klabs-studio-build';
const SCOPE_URL=new URL(self.registration.scope);
const SCOPE_PATH=SCOPE_URL.pathname.endsWith('/')?SCOPE_URL.pathname:`${SCOPE_URL.pathname}/`;
const APP_SHELL_ASSETS=[
	'',
	'index.html',
	'manifest.json',
	'404.html',
	'css/theme.css',
	'css/layout.css',
	'css/components.css',
	'css/animations.css',
	'css/studio.css',
	'css/knowledge.css',
	'css/invoice-document.css',
	'css/admin-access.css',
	'js/demo-mode.js',
	'js/demo-data.js',
	'js/demo-director.js',
	'js/build-tab-lock.js',
	'js/billing.js',
	'js/public-entry.js',
	'js/vendor/supabase-2.119.0.js',
	'js/vendor/pdfmake/pdfmake-0.2.20.min.js',
	'js/vendor/pdfmake/vfs_fonts.js',
	'js/supabase-config.js',
	'js/supabase-client.js',
	'js/config.js',
	'js/storage.js',
	'js/guide-layout.js',
	'js/thread-wrap.js',
	'js/guide-train.js',
	'js/thread-studio-host.js',
	'thread-studio/index.html',
	'js/kr-guide-layout-host.js',
	'kr-guide-layout/index.html',
	'js/knowledge-base.js',
	'js/studio-visuals.js',
	'js/navigation.js',
	'js/invoice-pdf.js',
	'js/ui.js',
	'js/component-sync.js',
	'js/build-sync-journal.js',
	'js/guarded-build-transport.js',
	'js/build-sync.js',
	'js/build-sync-diff.js',
	'js/build-sync-review.js',
	'js/business-logo.js',
	'js/settings-sync.js',
	'js/studio-recovery-export.js',
	'js/admin-panel.js',
	'js/quote-number-allocator.js',
	'js/app.js',
	'assets/logo.svg',
	'assets/rod-carbon.svg',
	'assets/icons/icon-180.png',
	'assets/icons/icon-192.png',
	'assets/icons/icon-512.png',
	'assets/icons/icon-192.svg',
	'assets/icons/icon-512.svg'
];

function inScope(url){
	return url.origin===SCOPE_URL.origin && url.pathname.startsWith(SCOPE_PATH);
}

function shouldCacheResponse(response){
	return !!(response && (response.status===200 || response.type==='opaque'));
}

function cacheAppShellResponse(request,response){
	if(!shouldCacheResponse(response))return Promise.resolve();
	return caches.open(CACHE).then((cache)=>cache.put(request,response));
}

// Q33 production fix: a release installs as ONE complete set. Each file is fetched with this release's version in the query, so
// neither the browser nor the CDN can hand back an older copy of one file, and every copy is checked before any is stored.
// Until the whole set is in, the previous release keeps running unchanged.
function installAppShell(){
	return Promise.all(APP_SHELL_ASSETS.map((assetPath)=>{
		const url=new URL(assetPath,SCOPE_URL);
		const fetchUrl=new URL(url.toString());
		fetchUrl.searchParams.set('shell',APP_SHELL_VERSION);
		return fetch(new Request(fetchUrl.toString(),{cache:'reload'})).then((response)=>{
			if(!response || response.status!==200)throw new Error(`App shell file ${assetPath||'index'} could not be downloaded.`);
			return [url.toString(),response];
		});
	})).then((downloaded)=>caches.open(CACHE).then((cache)=>Promise.all(downloaded.map(([key,response])=>cache.put(key,response)))));
}

self.addEventListener('install',(event)=>{
	event.waitUntil(installAppShell().then(()=>self.skipWaiting()));
});

self.addEventListener('activate',(event)=>{
	event.waitUntil(
		caches.keys()
			.then((keys)=>Promise.all(keys
				.filter((key)=>key!==CACHE && (key.startsWith(CACHE_PREFIX) || key.startsWith(LEGACY_CACHE_PREFIX)))
				.map((key)=>caches.delete(key))))
			.then(()=>self.clients.claim())
			.then(()=>self.clients.matchAll({type:'window'}))
			.then((clients)=>{clients.forEach((client)=>client.postMessage({type:'KLABS_SW_ACTIVE',cache:CACHE}));})
	);
});

self.addEventListener('message',(event)=>{
	if(event.data && event.data.type==='SKIP_WAITING'){
		self.skipWaiting();
		return;
	}
	if(event.data && event.data.type==='KLABS_SW_QUERY'){
		event.source && event.source.postMessage({type:'KLABS_SW_ACTIVE',cache:CACHE});
	}
});

// Every app-shell file comes from this release's own complete cache, and nothing refreshes one file on its own: a file-by-file
// background refresh could leave a new page with older code (Q33 production regression: v278's page ran v277's ui.js).
// A launch never waits for the network; a newer release arrives only as a whole, through a new APP_SHELL_VERSION.
function cachedAppShell(request,fallbackToIndex){
	return caches.open(CACHE).then((cache)=>cache.match(request,{ignoreSearch:fallbackToIndex}).then((cached)=>{
		if(cached || !fallbackToIndex)return cached;
		return cache.match(new URL('index.html',SCOPE_URL).toString());
	}));
}

function cacheFirst(event,fallbackToIndex){
	event.respondWith(
		cachedAppShell(event.request,fallbackToIndex).then((cached)=>{
			if(cached)return cached;
			return fetch(event.request).then((response)=>{
				cacheAppShellResponse(event.request,response.clone());
				return response;
			}).catch(()=>cachedAppShell(event.request,fallbackToIndex));
		})
	);
}

self.addEventListener('fetch',(event)=>{
	if(event.request.method!=='GET')return;
	const requestUrl=new URL(event.request.url);
	if(!inScope(requestUrl))return;
	// Q42b: the public Knowledge Base pages (/knowledge/...) are ordinary web pages, never answered with the app shell.
	if(requestUrl.pathname.startsWith(`${SCOPE_PATH}knowledge/`))return;

	cacheFirst(event,event.request.mode==='navigate');
});
