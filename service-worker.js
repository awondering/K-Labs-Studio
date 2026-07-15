const CACHE='klabs-studio-build058-v9';
const ASSETS=[
	'/',
	'/index.html',
	'/manifest.json',
	'/404.html',
	'/css/theme.css',
	'/css/layout.css',
	'/css/components.css',
	'/css/animations.css',
	'/css/studio.css',
	'/js/config.js',
	'/js/storage.js',
	'/js/guide-layout.js',
	'/js/studio-visuals.js',
	'/js/navigation.js',
	'/js/ui.js',
	'/js/app.js',
	'/assets/logo.svg',
	'/assets/rod-carbon.svg',
	'/assets/icons/icon-180.png',
	'/assets/icons/icon-192.png',
	'/assets/icons/icon-512.png',
	'/assets/icons/icon-192.svg',
	'/assets/icons/icon-512.svg'
];

self.addEventListener('install',(event)=>{
	event.waitUntil(
		caches.open(CACHE)
			.then((cache)=>cache.addAll(ASSETS))
			.then(()=>self.skipWaiting())
	);
});

self.addEventListener('activate',(event)=>{
	event.waitUntil(
		caches.keys()
			.then((keys)=>Promise.all(keys.filter((key)=>key!==CACHE).map((key)=>caches.delete(key))))
			.then(()=>self.clients.claim())
	);
});

self.addEventListener('fetch',(event)=>{
	if(event.request.method!=='GET')return;
	const requestUrl=new URL(event.request.url);
	if(requestUrl.origin!==self.location.origin)return;
	const pathname=requestUrl.pathname||'';
	const isDynamicAppAsset=pathname.endsWith('.html') || pathname.startsWith('/js/') || pathname.startsWith('/css/');

	if(event.request.mode==='navigate'){
		event.respondWith(
			fetch(event.request)
				.then((response)=>{
					const copy=response.clone();
					caches.open(CACHE).then((cache)=>cache.put('/index.html',copy));
					return response;
				})
				.catch(()=>caches.match('/index.html'))
		);
		return;
	}

	if(isDynamicAppAsset){
		event.respondWith(
			fetch(event.request)
				.then((response)=>{
					const copy=response.clone();
					caches.open(CACHE).then((cache)=>cache.put(event.request,copy));
					return response;
				})
				.catch(()=>caches.match(event.request).then((cached)=>cached||caches.match('/index.html')))
		);
		return;
	}

	event.respondWith(
		caches.match(event.request).then((cached)=>{
			if(cached)return cached;
			return fetch(event.request)
				.then((response)=>{
					const copy=response.clone();
					caches.open(CACHE).then((cache)=>cache.put(event.request,copy));
					return response;
				})
				.catch(()=>caches.match('/index.html'));
		})
	);
});
