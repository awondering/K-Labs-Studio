(function () {
  function client() {
    return window.KLABS_SUPABASE_CLIENT;
  }

  async function allocate(minimumNext) {
    const supabase = client();
    if (!supabase) throw new Error("Quote number service is unavailable.");
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    const userId = String(sessionData?.session?.user?.id || "");
    if (!userId || userId !== String(window.KLABS_ACCOUNT_ID || "")) {
      throw new Error("Sign in to allocate a synced quote number.");
    }
    const floor = Math.max(1, Math.round(Number(minimumNext) || 1));
    const { data, error } = await supabase.rpc("allocate_quote_number", { p_minimum_next: floor });
    if (error) throw error;
    const allocated = Number(data);
    if (!Number.isSafeInteger(allocated) || allocated < floor) {
      throw new Error("The quote number service returned an invalid sequence.");
    }
    const { data: latestSession } = await supabase.auth.getSession();
    const latestUserId = String(latestSession?.session?.user?.id || "");
    if (latestUserId !== userId || String(window.KLABS_ACCOUNT_ID || "") !== userId) {
      throw new Error("Account changed while allocating the quote number.");
    }
    return allocated;
  }

  window.KLABS_QUOTE_NUMBERS = { allocate };
})();