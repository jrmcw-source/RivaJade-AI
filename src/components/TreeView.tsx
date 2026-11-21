import React from 'react';
import { Family, Household, Circle, familyHeadName, circleHeadIds } from '../types';

// The Tree (Jason, 2026-11-20): one page showing the whole setup —
// the ground and the people. The place tree is the family's ground:
// Mom at the trunk, two state branches, every place a branch of its
// own. Over it, the people: the family ring, the household rings
// inside it, and the hand-drawn circles. The picture obeys the same
// law as the records: it is drawn from where the viewer stands.
// Circles the viewer is not in never arrive here at all, so they
// cannot appear — the surprise stays a surprise even on the map.

interface TreeViewProps {
  families: Family[];
  households: Household[];
  circles: Circle[];
  activeHousehold: Household | null;
}

const PLACE_TREE: Array<{
  name: string;
  note: string;
  children?: Array<{ name: string; note: string; children?: Array<{ name: string; note: string }> }>;
}> = [
  {
    name: 'Texas',
    note: 'The Wimberley side.',
    children: [
      {
        name: 'Riva Jade',
        note: '21.6 acres on the Blanco River — one property, three branches.',
        children: [
          { name: 'Homestead', note: "Mom's house, the shops, and the rental cabin inside the homestead acre." },
          { name: 'Rental Cabin', note: 'Its own branch: stays, guests, upkeep, taxes.' },
          { name: 'Wildlife Conservancy', note: 'The remaining 20.6 acres, left natural under the exemption.' },
        ],
      },
    ],
  },
  {
    name: 'Louisiana',
    note: 'The Lafayette side.',
    children: [
      { name: 'Oakleaf', note: "Mom's Lafayette house — Jason's place, hers in reserve." },
      { name: 'Elephant Walk', note: "Derek and Dawn's, in Carencro." },
    ],
  },
];

const card =
  'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3';
const heading = 'text-sm font-semibold text-slate-900 dark:text-slate-100';
const small = 'text-xs text-slate-500 dark:text-slate-400';

export const TreeView: React.FC<TreeViewProps> = ({
  families,
  households,
  circles,
  activeHousehold,
}) => {
  return (
    <div className="space-y-4 max-w-3xl">
      <div className={card}>
        <h2 className={heading}>The tree, as it stands from where you sit</h2>
        <p className={small}>
          The ground first, then the people over it — the family ring, the households inside it,
          and the circles you belong to. Circles you're not in don't appear here, the same as
          everywhere else in the desk.
        </p>
      </div>

      <div className={card}>
        <h3 className={heading}>The ground — Mom at the trunk</h3>
        <div className="space-y-3">
          {PLACE_TREE.map((branch) => (
            <div key={branch.name} className="border-l-2 border-teal-700/50 pl-3 space-y-2">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {branch.name}
                <span className={small}> — {branch.note}</span>
              </p>
              {(branch.children || []).map((place) => (
                <div key={place.name} className="border-l-2 border-slate-300 dark:border-slate-700 pl-3 space-y-1.5 ml-2">
                  <p className="text-xs font-medium text-slate-800 dark:text-slate-200">
                    {place.name}
                    <span className={small}> — {place.note}</span>
                  </p>
                  {(place.children || []).map((sub) => (
                    <p key={sub.name} className="text-xs text-slate-600 dark:text-slate-400 ml-2">
                      {sub.name} — {sub.note}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className={card}>
        <h3 className={heading}>The family</h3>
        {families.length === 0 ? (
          <p className={small}>
            No family drawn yet. Create one in Settings and the widest ring appears here.
          </p>
        ) : (
          families.map((f) => (
            <div key={f.id} className="space-y-1.5">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {f.name}
                <span className={small}>
                  {' '}
                  — head: {familyHeadName(f)} · {f.memberIds.length} account
                  {f.memberIds.length === 1 ? '' : 's'}
                  {(f.people || []).length > 0
                    ? ` · ${f.people!.length} counted people`
                    : ''}
                </span>
              </p>
              {(f.people || []).map((person, idx) => (
                <p key={idx} className="text-xs text-slate-600 dark:text-slate-400 ml-3">
                  {person.name}
                  {person.birthYear ? ` · born ${person.birthYear}` : ''}
                  {person.living === false ? ' · remembered' : ''}
                  {familyHeadName(f) === person.name && person.living !== false ? ' · head' : ''}
                </p>
              ))}
              <p className={small}>
                The giant circle descends but doesn't forget: when the head is lost, the eldest
                living counted person takes the trunk, and the roster keeps everyone it ever held.
              </p>
            </div>
          ))
        )}
      </div>

      <div className={card}>
        <h3 className={heading}>The households</h3>
        {households.length === 0 ? (
          <p className={small}>No households yet.</p>
        ) : (
          households.map((h) => (
            <p key={h.householdId} className="text-xs text-slate-600 dark:text-slate-400">
              <span className="font-medium text-slate-800 dark:text-slate-200">{h.name}</span> —{' '}
              {h.memberIds.length} member{h.memberIds.length === 1 ? '' : 's'}
              {h.familyId
                ? ` · linked to ${families.find((f) => f.id === h.familyId)?.name || 'its family'}`
                : ' · not linked to a family'}
              {activeHousehold?.householdId === h.householdId ? ' · you are viewing this one' : ''}
            </p>
          ))
        )}
      </div>

      <div className={card}>
        <h3 className={heading}>Your circles</h3>
        {circles.length === 0 ? (
          <p className={small}>
            No circles drawn yet. Draw one in Settings — any set of people, any shape at all.
          </p>
        ) : (
          circles.map((c) => {
            // Head names resolve through the family rosters, the one
            // place account ids carry names; an unresolved head is
            // simply not named here rather than guessed at.
            const headNames = circleHeadIds(c)
              .map((uid) => {
                for (const f of families) {
                  const person = (f.people || []).find((x) => x.userId === uid);
                  if (person) return person.name;
                }
                return households.find((h) => h.ownerId === uid)?.ownerName || '';
              })
              .filter(Boolean);
            return (
              <p key={c.id} className="text-xs text-slate-600 dark:text-slate-400">
                <span className="font-medium text-slate-800 dark:text-slate-200">{c.name}</span> —{' '}
                {c.memberIds.length} people ·{' '}
                {c.temporary
                  ? `temporary${c.expiresAtKey ? `, closes ${c.expiresAtKey}` : ''}`
                  : 'permanent'}
                {headNames.length > 0 ? ` · head: ${headNames.join(' & ')}` : ''}
              </p>
            );
          })
        )}
        <p className={small}>
          Only your circles are drawn. A circle you're not in isn't shown to you anywhere — not
          its name, not its records, not its place on this page.
        </p>
      </div>
    </div>
  );
};
