import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { preferenceGroups, collectionTools } from '../moreNavigation'
import { BackLink } from './BackLink'
import s from './MoreLayout.module.css'
export function MoreLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className={s.workspace} data-testid="more-layout">
      <BackLink />
      <div className={s.split}>
        <aside className={s.rail}>
          <nav aria-label="More navigation">
            <p>Preferences</p>
            {preferenceGroups.map(({ id, title, icon: Icon }) => (
              <NavLink
                key={id}
                to={'/settings/' + id}
                className={({ isActive }) => (isActive ? s.active : s.link)}
              >
                <Icon size={16} />
                {title}
              </NavLink>
            ))}
            <p>Collection tools</p>
            {collectionTools.map(({ path, title, icon: Icon }) => (
              <NavLink
                key={path}
                to={path}
                className={({ isActive }) => (isActive ? s.active : s.link)}
              >
                <Icon size={16} />
                {title}
              </NavLink>
            ))}
          </nav>
        </aside>
        <div className={s.content}>{children}</div>
      </div>
    </div>
  )
}
