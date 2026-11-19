/* The API key is used for this request only and is never persisted. */
(() => {
  async function series(symbol, cutoff, key, currency) {
    const params = new URLSearchParams({symbol, interval:'1day', outputsize:'390', end_date:cutoff, adjust:'splits'});
    const res = await fetch('https://api.twelvedata.com/time_series?' + params, {
      headers:{Authorization:'apikey ' + key}, cache:'no-store', credentials:'omit',
      referrerPolicy:'no-referrer', signal:AbortSignal.timeout(30000)
    });
    if (!res.ok) throw Error('Le fournisseur a refusé la demande (HTTP '+res.status+'). Vérifiez votre clé, vos droits et votre quota.');
    const body = await res.json();
    if (!Array.isArray(body.values) || !body.values.length) throw Error('Série indisponible pour '+symbol+'. Vérifiez la place, le symbole et le quota.');
    if (currency && body.meta?.currency !== currency) throw Error('La devise du fournisseur diffère de celle saisie pour '+symbol+'.');
    const rows = new Map();
    for (const bar of body.values) {
      if (typeof bar.datetime !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(bar.datetime)) throw Error('Date de séance invalide.');
      if (bar.datetime > cutoff) continue;
      const close = Number(bar.close);
      if (!Number.isFinite(close) || close<=0 || rows.has(bar.datetime)) throw Error('Série de cours incohérente.');
      rows.set(bar.datetime, close);
    }
    return rows;
  }

  async function load(symbol, currency, key) {
    const cutoff = new Date(Date.now()-86400000).toISOString().slice(0,10);
    const prices = await series(symbol, cutoff, key, currency);
    const rates = currency === 'EUR' ? null : await series('EUR/'+currency, cutoff, key);
    const rows = [...prices.keys()].sort().slice(-252).map(date => ({
      date, price:prices.get(date), fx:rates ? rates.get(date) : 1
    })).filter(row => row.fx !== undefined);
    if (!rows.length || rows.at(-1).date !== [...prices.keys()].sort().at(-1)) throw Error('Change indisponible pour la dernière séance. Les données existantes sont conservées.');
    return {currencies:{[symbol]:currency}, quotes:{[symbol]:rows}, updated:new Date().toISOString()};
  }
  window.FolioProvider = {load};
})();
