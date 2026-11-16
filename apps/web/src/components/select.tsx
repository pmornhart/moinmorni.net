import { Select as SelectPrimitive } from 'radix-ui';
import { Check, ChevronDown, ChevronUp, Lock } from 'lucide-react';
import {
  Children,
  Fragment,
  isValidElement,
  useRef,
  useState,
  type ChangeEvent,
  type ChangeEventHandler,
  type FocusEventHandler,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { cn } from '~/lib/cn';

/*
 * A choice list in MoinMorni's look (Radix Select): closed it looks like the other fields, open it is a card of the
 * page – readable in light and dark, a check at the chosen entry, locked entries clearly greyed out with a lock.
 *
 * It takes the same props as a native <select> with <option> (and <optgroup>) children: value/defaultValue,
 * onChange(event) with event.target.value, disabled, id for <label htmlFor>, name for forms. A hidden native
 * <select> keeps the value: forms read it by name (FormData), onChange gets a real change event, a ref points to it.
 */

export type SelectSize = 'md' | 'sm';

export interface SelectProps {
  readonly id?: string;
  readonly name?: string;
  readonly value?: string | number;
  readonly defaultValue?: string | number;
  readonly onChange?: ChangeEventHandler<HTMLSelectElement>;
  readonly disabled?: boolean;
  readonly required?: boolean;
  readonly form?: string;
  readonly autoComplete?: string;
  readonly autoFocus?: boolean;
  /** For the outer box (width, flex), like before. */
  readonly className?: string;
  /** <option> and <optgroup> elements, as in a native <select>. */
  readonly children?: ReactNode;
  /** "sm": as high as the small buttons (e.g. in lists). */
  readonly size?: SelectSize;
  /** Shown while the value matches no option. */
  readonly placeholder?: string;
  readonly title?: string;
  readonly onBlur?: FocusEventHandler<HTMLButtonElement>;
  readonly onFocus?: FocusEventHandler<HTMLButtonElement>;
  /** The hidden native <select> (it holds the value). */
  readonly ref?: Ref<HTMLSelectElement>;
  readonly 'aria-label'?: string;
  readonly 'aria-labelledby'?: string;
  readonly 'aria-describedby'?: string;
  readonly 'aria-invalid'?: boolean | 'true' | 'false';
}

interface Choice {
  readonly value: string;
  readonly label: ReactNode;
  /** Plain text for typing a letter to jump (without a leading symbol like "♛ "). */
  readonly text: string;
  readonly disabled: boolean;
  readonly title: string | undefined;
}

interface Section {
  /** Label of an <optgroup>; null for options outside a group. */
  readonly label: string | null;
  readonly choices: Choice[];
}

interface OptionProps {
  readonly value?: string | number;
  readonly label?: string;
  readonly disabled?: boolean;
  readonly title?: string;
  readonly children?: ReactNode;
}

/** Radix keeps "" for "nothing chosen"; every real value gets this in front. */
const VALUE_PREFIX = 'o:';
const encode = (value: string): string => `${VALUE_PREFIX}${value}`;
const decode = (key: string): string => key.slice(VALUE_PREFIX.length);

const TRIGGER_BASE =
  'group flex w-full min-w-0 cursor-pointer items-center justify-between gap-2 border border-input bg-background/60 text-left text-foreground transition-[border-color,box-shadow,background-color] hover:border-muted-foreground/40 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary/20 data-[state=open]:border-primary data-[state=open]:ring-3 data-[state=open]:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-destructive dark:bg-white/[0.03]';

const TRIGGER_SIZES: Readonly<Record<SelectSize, string>> = {
  md: 'h-11 rounded-[12px] px-3.5 text-[15px]',
  sm: 'h-8 rounded-[10px] px-3 text-sm',
};

const CONTENT =
  'z-[80] max-h-[min(22rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-24px)] overflow-hidden rounded-[14px] border border-border bg-popover text-popover-foreground shadow-float data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1';

const ITEM = cn(
  'relative flex min-h-10 cursor-pointer select-none items-center rounded-[10px] py-2 pl-3.5 pr-10 text-[15px] leading-snug text-popover-foreground outline-none transition-colors pointer-coarse:min-h-11',
  // Hover and arrow keys: emerald tint.
  'data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground',
  // The chosen one: bold, a gold bar at the start, a check at the end.
  'data-[state=checked]:font-semibold before:absolute before:inset-y-2 before:left-1 before:w-[3px] before:rounded-full before:bg-gold before:opacity-0 data-[state=checked]:before:opacity-100',
  // Not to choose: pale, crossed-out cursor, a lock at the end.
  'data-[disabled]:cursor-not-allowed data-[disabled]:text-muted-foreground data-[disabled]:opacity-60',
);

const SCROLL_BUTTON = 'flex h-7 cursor-default items-center justify-center text-muted-foreground';
/** Space between the field and the open list, and to the edge of the screen (px). */
const LIST_GAP = 6;
const SCREEN_EDGE = 12;
const CHECK_STROKE = 2.75;
/** Marks the hidden native <select> (Radix puts its own one next to it inside forms). */
const HOLDER = 'data-select-holder';

// Symbols and spaces in front of the first letter or digit: "♛ Owner" → "Owner", so typing "o" finds it.
// https://regex101.com/?flavor=javascript&flags=u&regex=%5E%5B%5E%5Cp%7BL%7D%5Cp%7BN%7D%5D%2B&testString=%E2%99%9B%20Owner
const LEADING_SYMBOLS = /^[^\p{L}\p{N}]+/u;

/** Plain text of an option's content, as the browser would show it. */
function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map((part: ReactNode) => textOf(part)).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return '';
}

function choiceOf(props: OptionProps, groupDisabled: boolean): Choice {
  const text = textOf(props.children).trim() || (props.label ?? '');
  return {
    // Like the browser: an <option> without value has its text as value.
    value: props.value === undefined ? text : String(props.value),
    label: props.children ?? props.label,
    text: text.replace(LEADING_SYMBOLS, '') || text,
    disabled: groupDisabled || Boolean(props.disabled),
    title: props.title,
  };
}

/** The options in the order a native <select> lists them; <optgroup>s become labelled sections. */
function sectionsOf(children: ReactNode): Section[] {
  const sections: Section[] = [];
  const loose = (): Choice[] => {
    const last = sections.at(-1);
    if (last && last.label === null) return last.choices;
    const fresh: Section = { label: null, choices: [] };
    sections.push(fresh);
    return fresh.choices;
  };
  const walk = (nodes: ReactNode, group: Choice[] | null, groupDisabled: boolean): void => {
    Children.toArray(nodes).forEach((child) => {
      if (!isValidElement(child)) return;
      const props = child.props as OptionProps;
      if (child.type === Fragment) walk(props.children, group, groupDisabled);
      else if (child.type === 'option') (group ?? loose()).push(choiceOf(props, groupDisabled));
      else if (child.type === 'optgroup') {
        const section: Section = { label: props.label ?? '', choices: [] };
        sections.push(section);
        walk(props.children, section.choices, groupDisabled || Boolean(props.disabled));
      }
    });
  };
  walk(children, null, false);
  return sections;
}

/** What a native <select> shows first: the first option one may choose. */
function firstValue(choices: readonly Choice[]): string {
  return (choices.find((c) => !c.disabled) ?? choices[0])?.value ?? '';
}

/** Sets the value the way the browser would, so React sees a real change on the hidden <select>. */
function chooseOnNative(node: HTMLSelectElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(node, value);
  node.dispatchEvent(new Event('change', { bubbles: true }));
}

function ChoiceItem({
  choice,
  current,
}: {
  readonly choice: Choice;
  readonly current: string;
}): ReactElement {
  const locked = choice.disabled && choice.value !== current;
  return (
    <SelectPrimitive.Item
      value={encode(choice.value)}
      disabled={choice.disabled}
      textValue={choice.text}
      title={choice.title}
      className={ITEM}
    >
      <SelectPrimitive.ItemText>{choice.label}</SelectPrimitive.ItemText>
      <span className="absolute right-3 flex size-4 items-center justify-center" aria-hidden>
        {locked ? (
          <Lock className="size-3.5" />
        ) : (
          <SelectPrimitive.ItemIndicator>
            <Check className="size-4 text-primary" strokeWidth={CHECK_STROKE} />
          </SelectPrimitive.ItemIndicator>
        )}
      </span>
    </SelectPrimitive.Item>
  );
}

export function Select({
  id,
  name,
  value,
  defaultValue,
  onChange,
  disabled = false,
  required,
  form,
  autoComplete,
  autoFocus,
  className,
  children,
  size = 'md',
  placeholder,
  title,
  onBlur,
  onFocus,
  ref,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
}: SelectProps): ReactElement {
  const sections = sectionsOf(children);
  const choices = sections.flatMap((s) => s.choices);
  const box = useRef<HTMLDivElement>(null);
  const [listName, setListName] = useState<string | undefined>(undefined);
  const [own, setOwn] = useState(() =>
    defaultValue === undefined ? firstValue(choices) : String(defaultValue),
  );
  const controlled = value !== undefined;
  const current = controlled ? String(value) : own;
  const chosen = choices.find((c) => c.value === current);

  const changed = (event: ChangeEvent<HTMLSelectElement>): void => {
    if (!controlled) setOwn(event.target.value);
    onChange?.(event);
  };
  const pick = (key: string): void => {
    const node = box.current?.querySelector<HTMLSelectElement>(`select[${HOLDER}]`);
    if (node) chooseOnNative(node, decode(key));
  };
  /** The open list is named like the field: its <label> (or aria-label). */
  const opened = (open: boolean): void => {
    if (!open || ariaLabelledBy) return;
    const label = box.current?.querySelector('button')?.labels?.[0]?.textContent?.trim();
    setListName(ariaLabel ?? (label || undefined));
  };

  return (
    <div ref={box} className={cn('relative', className)}>
      <select
        ref={ref}
        name={name}
        value={current}
        onChange={changed}
        disabled={disabled}
        required={required}
        form={form}
        autoComplete={autoComplete}
        aria-hidden
        tabIndex={-1}
        data-select-holder=""
        className="pointer-events-none absolute inset-0 size-full opacity-0"
      >
        {children}
      </select>
      <SelectPrimitive.Root
        value={encode(current)}
        onValueChange={pick}
        onOpenChange={opened}
        disabled={disabled}
      >
        <SelectPrimitive.Trigger
          id={id}
          title={title}
          autoFocus={autoFocus}
          onBlur={onBlur}
          onFocus={onFocus}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          className={cn(TRIGGER_BASE, TRIGGER_SIZES[size])}
        >
          <span className={cn('min-w-0 flex-1 truncate', chosen ? null : 'text-muted-foreground')}>
            {chosen ? chosen.label : (placeholder ?? '–')}
          </span>
          <SelectPrimitive.Icon asChild>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180 group-data-[state=open]:text-primary" />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position="popper"
            side="bottom"
            align="start"
            sideOffset={LIST_GAP}
            collisionPadding={SCREEN_EDGE}
            aria-label={ariaLabelledBy ? undefined : listName}
            aria-labelledby={ariaLabelledBy}
            className={CONTENT}
          >
            <SelectPrimitive.ScrollUpButton className={SCROLL_BUTTON}>
              <ChevronUp className="size-4" />
            </SelectPrimitive.ScrollUpButton>
            <SelectPrimitive.Viewport className="p-1.5">
              {sections.map((section, index) =>
                section.label === null ? (
                  section.choices.map((choice) => (
                    <ChoiceItem key={`${index}:${choice.value}`} choice={choice} current={current} />
                  ))
                ) : (
                  <SelectPrimitive.Group key={`${index}:${section.label}`}>
                    <SelectPrimitive.Label className="px-3.5 pb-1 pt-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-gold">
                      {section.label}
                    </SelectPrimitive.Label>
                    {section.choices.map((choice) => (
                      <ChoiceItem key={choice.value} choice={choice} current={current} />
                    ))}
                  </SelectPrimitive.Group>
                ),
              )}
            </SelectPrimitive.Viewport>
            <SelectPrimitive.ScrollDownButton className={SCROLL_BUTTON}>
              <ChevronDown className="size-4" />
            </SelectPrimitive.ScrollDownButton>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </div>
  );
}
