// TEMPORARY DIAGNOSTIC surface: this cache id is also shown in Settings → Account → Sync diagnostics.
const APP_SHELL_VERSION='build148-v273';
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
	'css/invoice-document.css',
	'css/admin-access.css',
	'js/demo-mode.js',
	'js/demo-data.js',
	'js/demo-director.js',
	'js/build-tab-lock.js',
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

function stripScopePath(url){
	if(!inScope(url))return '';
	const relative=url.pathname.slice(SCOPE_PATH.length);
	return relative.replace(/^\/+/,'');
}

function isDynamicAppAsset(url){
	const relative=stripScopePath(url);
	if(!relative)return false;
	return relative==='index.html'
		|| relative==='manifest.json'
		|| relative.endsWith('.html')
		|| relative.startsWith('js/')
		|| relative.startsWith('css/');
}

function shouldCacheResponse(response){
	return !!(response && (response.status===200 || response.type==='opaque'));
}

function cacheAppShellResponse(request,response){
	if(!shouldCacheResponse(response))return Promise.resolve();
	return caches.open(CACHE).then((cache)=>cache.put(request,response));
}

self.addEventListener('install',(event)=>{
	event.waitUntil(
		caches.open(CACHE)
			.then((cache)=>{
				const requests=APP_SHELL_ASSETS.map((assetPath)=>new Request(new URL(assetPath,SCOPE_URL).toString(),{cache:'reload'}));
				return cache.addAll(requests);
			})
			.then(()=>self.skipWaiting())
	);
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

// Every app-shell file is precached by the versioned install step above, so a launch never has to wait for the network
// to find out whether a file changed. Serve the cached copy at once and refresh it in the background
// (stale-while-revalidate): the next launch gets the newer copy, and a new APP_SHELL_VERSION installs and activates the
// whole new shell together. Waiting on the network first made every launch pay one round trip per file, and left the app
// blank for as long as the platform's own network timeout when the connection was poor but not offline.
function cachedAppShell(request,fallbackToIndex){
	return caches.match(request,{ignoreSearch:fallbackToIndex}).then((cached)=>{
		if(cached || !fallbackToIndex)return cached;
		return caches.match(new URL('index.html',SCOPE_URL).toString());
	});
}

function refreshAppShell(request,fetchCache){
	return fetch(new Request(request,{cache:fetchCache})).then((response)=>{
		cacheAppShellResponse(request,response.clone());
		return response;
	});
}

function staleWhileRevalidate(event,fetchCache,fallbackToIndex){
	event.respondWith(
		cachedAppShell(event.request,fallbackToIndex).then((cached)=>{
			const refreshed=refreshAppShell(event.request,fetchCache);
			if(cached){
				event.waitUntil(refreshed.catch(()=>{}));
				return cached;
			}
			return refreshed.catch(()=>cachedAppShell(event.request,fallbackToIndex));
		})
	);
}

self.addEventListener('fetch',(event)=>{
	if(event.request.method!=='GET')return;
	const requestUrl=new URL(event.request.url);
	if(!inScope(requestUrl))return;

	if(event.request.mode==='navigate'){
		staleWhileRevalidate(event,'no-store',true);
		return;
	}

	if(isDynamicAppAsset(requestUrl)){
		staleWhileRevalidate(event,'no-cache',false);
		return;
	}

	event.respondWith(
		caches.match(event.request).then((cached)=>{
			if(cached)return cached;
			return fetch(event.request)
				.then((response)=>{
					cacheAppShellResponse(event.request,response.clone());
					return response;
				});
		})
	);
});
