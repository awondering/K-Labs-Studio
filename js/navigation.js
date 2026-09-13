function syncHomeScreenClass(activeScreenId){
	document.body.classList.toggle('home-screen-active',activeScreenId==='homeScreen');
}

function hasScreen(id){
	return !!document.getElementById(id);
}

function safeGoScreen(id){
	goScreen(hasScreen(id)?id:'homeScreen');
}

function activeNavTargetForScreen(screenId){
	if(screenId==='layoutScreen')return 'workshopLandingScreen';
	if(screenId==='buildsScreen')return 'workshopScreen';
	return screenId;
}

// Remembers where the user was reading on each screen so bottom-nav round trips resume in place.
const screenScrollPositions=new Map();

function rememberActiveScreenScroll(){
	const active=document.querySelector('.screen.active');
	if(!active)return;
	screenScrollPositions.set(active.id,window.scrollY||window.pageYOffset||0);
}

function forgetScreenScroll(id){
	screenScrollPositions.delete(id);
}

function goScreen(id){
	const activeNavId=activeNavTargetForScreen(id);
	rememberActiveScreenScroll();
	document.querySelectorAll('.screen').forEach((screen)=>screen.classList.toggle('active',screen.id===id));
	document.querySelectorAll('[data-nav]').forEach((button)=>button.classList.toggle('active',button.dataset.nav===activeNavId));
	syncHomeScreenClass(id);
	if(window.KLABS_UI && typeof window.KLABS_UI.onScreenChange==='function'){
		window.KLABS_UI.onScreenChange(id);
	}
	const restoreY=screenScrollPositions.get(id)||0;
	scrollTo(0,restoreY);
	if(restoreY>0){
		requestAnimationFrame(()=>scrollTo(0,restoreY));
	}
}

document.addEventListener('click',(event)=>{
	const nav=event.target.closest('[data-nav]');
	if(nav){
		if(nav.dataset.nav==='workshopLandingScreen' && window.KLABS_UI && typeof window.KLABS_UI.prepareWorkshopLanding==='function'){
			window.KLABS_UI.prepareWorkshopLanding();
		}
		if(nav.dataset.nav==='workshopScreen' && window.KLABS_UI && typeof window.KLABS_UI.enterStudioFromBottomNav==='function'){
			window.KLABS_UI.enterStudioFromBottomNav();
			return;
		}
		if(nav.dataset.nav==='buildsScreen' && window.KLABS_UI && typeof window.KLABS_UI.openActiveBuildsList==='function'){
			window.KLABS_UI.openActiveBuildsList();
			return;
		}
		safeGoScreen(nav.dataset.nav);
	}
});

window.KLABS_NAV={forgetScreenScroll};

const initialActiveScreen=document.querySelector('.screen.active');
syncHomeScreenClass(initialActiveScreen?initialActiveScreen.id:'homeScreen');
