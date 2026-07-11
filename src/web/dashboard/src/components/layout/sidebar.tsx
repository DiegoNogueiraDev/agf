/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { memo, useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useTheme } from '@/providers/theme-provider'
import { GitFork, Sun, Moon, PanelLeftClose, PanelLeft, Menu, X, Search } from 'lucide-react'
import { NAV_GROUPS } from './nav-config'
import { SidebarGroup } from './sidebar-group'
export type { TabId } from './nav-config'
export { NAV_GROUPS, NAV_ITEMS } from './nav-config'
export type { NavGroup, NavGroupId, NavItem } from './nav-config'
import type { TabId } from './nav-config'

const STORAGE_KEY = 'mcp-graph-sidebar-collapsed'

interface SidebarProps {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
}

export const Sidebar = memo(function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const { theme, toggleTheme } = useTheme()
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })
  const [mobileOpen, setMobileOpen] = useState(false)
  const [tabSearch, setTabSearch] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const drawerRef = useRef<HTMLElement>(null)

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(STORAGE_KEY, String(next))
      } catch {
        /* noop */
      }
      return next
    })
  }, [])

  const handleTabChange = useCallback(
    (tab: TabId) => {
      onTabChange(tab)
      setMobileOpen(false)
    },
    [onTabChange],
  )

  // Close mobile drawer on Escape
  useEffect(() => {
    if (!mobileOpen) return
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setMobileOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [mobileOpen])

  // Focus trap for mobile drawer
  useEffect(() => {
    if (!mobileOpen || !drawerRef.current) return
    const drawer = drawerRef.current
    const focusable = drawer.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]

    function trapFocus(e: KeyboardEvent): void {
      if (e.key !== 'Tab') return
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    drawer.addEventListener('keydown', trapFocus)
    // Focus first element when drawer opens
    first.focus()
    return () => drawer.removeEventListener('keydown', trapFocus)
  }, [mobileOpen])

  // Cmd+K / Ctrl+K to focus sidebar search
  const pendingSearchFocusRef = useRef(false)

  useEffect(() => {
    function handleCmdK(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        pendingSearchFocusRef.current = true
        setCollapsed(false)
      }
    }
    document.addEventListener('keydown', handleCmdK)
    return () => document.removeEventListener('keydown', handleCmdK)
  }, [])

  // Focus the search input once it mounts (collapsed sidebar renders it only after expanding)
  useEffect(() => {
    if (pendingSearchFocusRef.current && searchInputRef.current) {
      searchInputRef.current.focus()
      pendingSearchFocusRef.current = false
    }
  })

  // Filter nav groups by search
  const filteredGroups = useMemo(() => {
    if (!tabSearch.trim()) return NAV_GROUPS
    const q = tabSearch.toLowerCase()
    return NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => item.label.toLowerCase().includes(q)),
    })).filter((group) => group.items.length > 0)
  }, [tabSearch])

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  const renderSidebarContent = (isMobile: boolean) => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-4 border-b border-edge">
        <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center flex-shrink-0">
          <GitFork className="w-4 h-4 text-white" />
        </div>
        {!collapsed && <span className="text-sm font-semibold text-foreground truncate">mcp-graph</span>}
      </div>

      {/* Quick Search */}
      {!collapsed && (
        <div className="px-3 pt-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search tabs... (⌘K)"
              value={tabSearch}
              onChange={(e) => setTabSearch(e.target.value)}
              className="w-full pl-7 pr-2 py-1.5 text-xs bg-surface border border-edge rounded-md focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
        </div>
      )}

      {/* Nav Groups */}
      <nav role="navigation" aria-label="Main navigation" className="flex-1 overflow-y-auto py-2 px-2">
        {filteredGroups.length === 0 && tabSearch ? (
          <div className="px-3 py-4 text-xs text-muted text-center">No tabs match</div>
        ) : (
          filteredGroups.map((group) => (
            <SidebarGroup
              key={group.id}
              group={group}
              activeTab={activeTab}
              collapsed={collapsed}
              onTabChange={handleTabChange}
              defaultExpanded={isMobile}
              touchFriendly={isMobile}
            />
          ))
        )}
      </nav>

      {/* Bottom Section */}
      <div className="border-t border-edge px-3 py-3 space-y-2">
        {/* Theme toggle + Collapse toggle */}
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'}`}>
          <button
            onClick={toggleTheme}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            className="p-2 rounded-lg text-muted hover:bg-surface-elevated hover:text-foreground transition-colors"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Collapse toggle — hidden on mobile */}
          <button
            onClick={toggleCollapsed}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="hidden md:flex p-2 rounded-lg text-muted hover:bg-surface-elevated hover:text-foreground transition-colors"
          >
            {collapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* Mobile hamburger — shown only on small screens */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-3 left-3 z-50 md:hidden p-2 rounded-lg bg-surface-alt border border-edge shadow-sm hover:bg-surface-elevated transition-colors"
        aria-label="Open navigation menu"
      >
        <Menu className="w-5 h-5 text-foreground" />
      </button>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile drawer */}
      <aside
        ref={drawerRef}
        className={`
          fixed top-0 left-0 z-50 h-full w-[240px]
          bg-surface-alt border-r border-edge
          transform transition-transform duration-200 ease-out
          md:hidden
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
        aria-label="Navigation sidebar"
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-3 right-3 p-1.5 rounded-lg text-muted hover:bg-surface-elevated hover:text-foreground transition-colors"
          aria-label="Close navigation menu"
        >
          <X className="w-4 h-4" />
        </button>
        {renderSidebarContent(true)}
      </aside>

      {/* Desktop sidebar */}
      <aside
        className={`
          hidden md:flex flex-col flex-shrink-0 h-full
          bg-surface-alt border-r border-edge
          transition-[width] duration-200 ease-out
          ${collapsed ? 'w-16' : 'w-60'}
        `}
        aria-label="Navigation sidebar"
      >
        {renderSidebarContent(false)}
      </aside>
    </>
  )
})
