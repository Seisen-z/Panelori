import {
  Palette,
  Compass,
  LibraryBig,
  BookOpen,
  Download,
  Archive,
  Network,
  SlidersHorizontal,
  BarChart3,
  Info
} from 'lucide-react'
export const preferenceGroups = [
  {
    id: 'appearance',
    title: 'Appearance',
    copy: 'Theme, covers and collection layouts',
    icon: Palette
  },
  {
    id: 'library',
    title: 'Library',
    copy: 'Categories, chapter checks and notifications',
    icon: LibraryBig
  },
  {
    id: 'reader',
    title: 'Reader',
    copy: 'Reading mode, page controls and display',
    icon: BookOpen
  },
  {
    id: 'downloads',
    title: 'Downloads',
    copy: 'Storage, queue and offline reading',
    icon: Download
  },
  { id: 'backup', title: 'Backup', copy: 'Automatic backups and retention', icon: Archive },
  { id: 'browse', title: 'Browse', copy: 'Source visibility and catalogue filters', icon: Compass },
  { id: 'network', title: 'Network', copy: 'Connection behavior and capabilities', icon: Network },
  {
    id: 'advanced',
    title: 'Advanced',
    copy: 'Desktop behavior and local data',
    icon: SlidersHorizontal
  }
]
export const collectionTools = [
  {
    path: '/downloads',
    title: 'Downloads',
    copy: 'Manage your offline chapter queue',
    icon: Download
  },
  {
    path: '/backup',
    title: 'Backup & Restore',
    copy: 'Export or restore your collection',
    icon: Archive
  },
  {
    path: '/statistics',
    title: 'Statistics',
    copy: 'Your reading record on this device',
    icon: BarChart3
  },
  {
    path: '/about',
    title: 'About & Shortcuts',
    copy: 'Version, keyboard controls and updates',
    icon: Info
  }
]
