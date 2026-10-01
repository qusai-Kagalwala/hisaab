/**
 * Android Auto Backup for Hisaab: back up the SQLite database (files/SQLite)
 * and plain preferences to the user's own Google account, and never the
 * secure store (where the optional AI key and backup key live).
 *
 * expo-secure-store's own rules only include shared preferences, which would
 * leave the ledger out of the backup — so we use ours instead.
 */
const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const RULES = `
    <include domain="file" path="SQLite/" />
    <include domain="sharedpref" path="." />
    <exclude domain="sharedpref" path="SecureStore" />`;

const FULL_BACKUP = `<?xml version="1.0" encoding="utf-8"?>
<!-- Android 11 and lower -->
<full-backup-content>${RULES}
</full-backup-content>
`;

const EXTRACTION = `<?xml version="1.0" encoding="utf-8"?>
<!-- Android 12 and higher -->
<data-extraction-rules>
  <cloud-backup>${RULES}
  </cloud-backup>
  <device-transfer>${RULES}
  </device-transfer>
</data-extraction-rules>
`;

module.exports = function withHisaabBackup(config) {
  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'hisaab_backup_rules.xml'), FULL_BACKUP);
      fs.writeFileSync(path.join(dir, 'hisaab_data_extraction_rules.xml'), EXTRACTION);
      return cfg;
    },
  ]);
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application[0];
    app.$['android:allowBackup'] = 'true';
    app.$['android:fullBackupContent'] = '@xml/hisaab_backup_rules';
    app.$['android:dataExtractionRules'] = '@xml/hisaab_data_extraction_rules';
    return cfg;
  });
};
