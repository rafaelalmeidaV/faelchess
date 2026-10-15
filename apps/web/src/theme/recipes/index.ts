import { absoluteCenter } from './absolute-center'
import { alert } from './alert'
import { avatar } from './avatar'
import { badge } from './badge'
import { button } from './button'
import { card } from './card'
import { checkbox } from './checkbox'
import { clipboard } from './clipboard'
import { dialog } from './dialog'
import { drawer } from './drawer'
import { field } from './field'
import { group } from './group'
import { heading } from './heading'
import { icon } from './icon'
import { input } from './input'
import { kbd } from './kbd'
import { link } from './link'
import { progress } from './progress'
import { radioCardGroup } from './radio-card-group'
import { segmentGroup } from './segment-group'
import { skeleton } from './skeleton'
import { spinner } from './spinner'
import { switchRecipe } from './switch'
import { table } from './table'
import { tabs } from './tabs'
import { text } from './text'
import { toast } from './toast'
import { toggleGroup } from './toggle-group'
import { tooltip } from './tooltip'

// O CLI do Park UI (1.0.1) registra tudo em `recipes`; as receitas com partes precisam ficar em `slotRecipes`.
export const recipes = {
  absoluteCenter,
  badge,
  button,
  group,
  heading,
  icon,
  input,
  kbd,
  link,
  skeleton,
  spinner,
  text,
}

export const slotRecipes = {
  alert,
  avatar,
  card,
  checkbox,
  clipboard,
  dialog,
  drawer,
  field,
  progress,
  radioCardGroup,
  segmentGroup,
  switchRecipe,
  table,
  tabs,
  toast,
  toggleGroup,
  tooltip,
}
