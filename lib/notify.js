export function createNotifier({ dbGetSetting, dbGetSite, dbUpdateSiteLastNotified, logger }) {
  return async function maybeNotify(hostname) {
    try {
      if (dbGetSetting('ntfy_enabled') !== 'true') return;
      const channel = dbGetSetting('ntfy_channel');
      if (!channel) return;

      const cooldownMinutes = parseInt(dbGetSetting('ntfy_cooldown_minutes') ?? '15', 10);
      const site = dbGetSite(hostname);
      if (site?.last_notified && cooldownMinutes > 0) {
        const elapsed = (Date.now() - new Date(site.last_notified).getTime()) / 60000;
        if (elapsed < cooldownMinutes) return;
      }

      await fetch(`https://ntfy.sh/${channel}`, {
        method: 'POST',
        body: 'Faultsy error detected',
      });

      dbUpdateSiteLastNotified(hostname);
    } catch (err) {
      logger.error('Notification failed for %s: %s', hostname, err.message);
    }
  };
}
