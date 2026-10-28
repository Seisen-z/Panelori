import { ArrowLeft } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { resolveOrigin } from '../navigation'
import s from './MoreLayout.module.css'
export function BackLink({
  to = '/more',
  label = 'More',
  useOrigin = true
}: {
  to?: string
  label?: string
  useOrigin?: boolean
}): JSX.Element {
  const location = useLocation()
  const target = useOrigin
    ? resolveOrigin(location.state, { path: to, label })
    : { path: to, label }
  return (
    <Link
      className={s.back}
      to={target.path}
      state={target.state}
      aria-label={'Back to ' + target.label}
    >
      <ArrowLeft size={16} />
      <span>Back to {target.label}</span>
    </Link>
  )
}
