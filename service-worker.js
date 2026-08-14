const APP_SHELL_VERSION='build063-v77';
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
	'js/config.js',
	'js/storage.js',
	'js/guide-layout.js',
	'js/studio-visuals.js',
	'js/navigation.js',
	'js/ui.js',
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
	);
});

self.addEventListener('message',(event)=>{
	if(event.data && event.data.type==='SKIP_WAITING'){
		self.skipWaiting();
	}
});

self.addEventListener('fetch',(event)=>{
	if(event.request.method!=='GET')return;
	const requestUrl=new URL(event.request.url);
	if(!inScope(requestUrl))return;

	if(event.request.mode==='navigate'){
		event.respondWith(
			fetch(new Request(event.request,{cache:'no-store'}))
				.then((response)=>{
					cacheAppShellResponse(event.request,response.clone());
					return response;
				})
				.catch(()=>caches.match(new URL('index.html',SCOPE_URL).toString()))
		);
		return;
	}

	if(isDynamicAppAsset(requestUrl)){
		event.respondWith(
			fetch(new Request(event.request,{cache:'no-cache'}))
				.then((response)=>{
					cacheAppShellResponse(event.request,response.clone());
					return response;
				})
				.catch(()=>caches.match(event.request))
		);
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
