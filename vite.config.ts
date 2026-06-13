/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { crx, defineManifest } from '@crxjs/vite-plugin'

const manifest = defineManifest({
  manifest_version: 3,
  name: 'English Extension',
  version: '1.0.0',
  description: 'An extension to learn English vocabulary and grammar.',
  icons: {
    "16": "logo.png",
    "32": "logo.png",
    "48": "logo.png",
    "128": "logo.png"
  },
  action: {
    default_popup: 'index.html',
  },
  permissions: ['storage', 'activeTab', 'scripting', 'contextMenus', 'sidePanel'],
  host_permissions: ['<all_urls>'],
  background: {
    service_worker: 'src/background.ts',
    type: 'module'
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content.tsx']
    }
  ],
  side_panel: {
    default_path: 'index.html'
  },
  commands: {
    "open_side_panel": {
      "suggested_key": {
        "default": "Ctrl+Shift+E",
        "mac": "Command+Shift+E"
      },
      "description": "Open English Extension Side Panel"
    }
  }
})

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
  }
})
