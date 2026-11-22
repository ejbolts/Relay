import { useRef, useState } from 'react';
import { Icon } from './Icon';
import { PopupDialog } from './PopupDialog';
import { ProfileAvatar, type AvatarUser } from './ProfileAvatar';
import { RARITY_BY_GRADE, RARITY_LABELS, borderUnlockedLabel } from './profileBorderLabels';
import { profileBorderGrade } from './profileBorderShapes';

/** The border a member wears, on their profile; it opens the border larger with its details. */
export function SharedBorderChip({
  member,
  name,
  unlockedOn,
}: {
  member: AvatarUser;
  name: string;
  unlockedOn?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  // The art's grade follows the border's rarity, so the profile needn't send it.
  const grade = profileBorderGrade(member.profile_border);
  const rarity = grade ? RARITY_BY_GRADE[grade - 1] : null;
  const unlocked = borderUnlockedLabel(unlockedOn);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="profile-border-chip"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Icon name="border" />
        <span className="sr-only">Border: </span>
        {name}
      </button>
      {open && (
        <PopupDialog
          title={name}
          titleBadge={
            rarity && <span className={`border-rarity ${rarity}`}>{RARITY_LABELS[rarity]}</span>
          }
          className="border-info-dialog"
          swipeToDismiss
          onClose={() => {
            setOpen(false);
            requestAnimationFrame(() => trigger.current?.focus());
          }}
        >
          <div className="border-info">
            <ProfileAvatar className="profile-avatar border-info-avatar" user={member} animated />
            {unlocked && <p className="border-info-unlocked">{unlocked}</p>}
          </div>
        </PopupDialog>
      )}
    </>
  );
}
