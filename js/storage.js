window.Store={
  get(k,f){try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}},
  set(k,v){
    const canWrite=typeof window.KLABS_CAN_WRITE==="function"?window.KLABS_CAN_WRITE():window.KLABS_ACCESS_STATE?.can_write!==false;
    if(!canWrite&&!window.KLABS_SYNC_HYDRATION){
      if(window.KLABS_ACCESS_STATE)window.KLABS_ACCESS_STATE.writeBlocked=true;
      if(window.dispatchEvent&&typeof CustomEvent==="function")window.dispatchEvent(new CustomEvent("klabs:write-blocked",{detail:{key:k}}));
      return false;
    }
    localStorage.setItem(k,JSON.stringify(v));
    return true;
  }
};
