import type { ReactElement } from 'react';
import { profileColor } from '../../../shared/color';
import { BotFace } from '../bots/face/BotFace';
import type { RemoteGroupMember } from '../../../shared/protocol';
import styles from './GroupAvatar.module.css';

const PALETTE = ['#7f9a3f', '#4f86d6', '#d97757', '#8c6bb1', '#2f9e8f', '#b7791f'];

export interface GroupAvatarProps {
  readonly seed: string;
  readonly count: number;
  readonly members?: readonly RemoteGroupMember[];
  readonly size: number;
  readonly label: string;
}

function colorFor(member: RemoteGroupMember | null, seed: string, index: number): string {
  if (member !== null) {
    const color = profileColor(member.profile);
    if (color !== '') {
      return color;
    }
  }
  let hash = 0;
  const key = `${seed}:${index}`;
  for (let cursor = 0; cursor < key.length; cursor += 1) {
    hash = (hash * 31 + key.charCodeAt(cursor)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length]!;
}

/** Overlapping member faces used for group entries and the group header. */
export function GroupAvatar({
  seed,
  count,
  members = [],
  size,
  label,
}: GroupAvatarProps): ReactElement {
  const visible = Math.max(1, Math.min(3, count));
  const faceSize = visible === 1 ? size : Math.round(size * 0.62);
  return (
    <span
      className={styles.avatar}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
    >
      {Array.from({ length: visible }, (_, index) => {
        const member = members[index] ?? null;
        const position =
          visible === 1
            ? { left: 0, top: 0 }
            : visible === 2
              ? { left: index === 0 ? 0 : size - faceSize, top: Math.round(size * 0.18) }
              : {
                  left:
                    index === 0
                      ? 0
                      : index === 1
                        ? size - faceSize
                        : Math.round((size - faceSize) / 2),
                  top: index === 2 ? size - faceSize : 0,
                };
        return (
          <span
            key={member?.memberId ?? `face-${index}`}
            className={styles.face}
            style={{ width: faceSize, height: faceSize, ...position }}
          >
            <BotFace
              shape="circle"
              color={colorFor(member, seed, index)}
              seed={member?.profile ?? `${seed}-${index}`}
              mood="idle"
              size={faceSize}
            />
          </span>
        );
      })}
    </span>
  );
}
