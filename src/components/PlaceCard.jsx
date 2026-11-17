import React from 'react';
import { Bookmark, MapPin, Quote, Check, CalendarDays, ChevronDown, Trash2, Star, BookmarkPlus } from 'lucide-react';
import { PlacePhoto } from './PlacePhoto.jsx';
import { Tag } from './Shell.jsx';
import { tagsForPlace, shortLocation } from '../theme.js';
import { formatDayDate } from '../lib/helpers.js';

export function PlaceCard({
  place, trip, onAddToDay, onDelete, onSave, saved = true, compact = false, photoClass = 'h-36', onClick, highlight = false
}) {
  const tags = tagsForPlace(place);
  const loc = shortLocation(place);
  const note = place.note && !/^Rated /.test(place.note) ? place.note : '';

  return (
    <article
      onClick={onClick}
      className={`tl-card overflow-hidden flex flex-col tl-fade transition-shadow hover:shadow-md ${highlight ? 'ring-2 ring-clay/50' : ''} ${onClick ? 'cursor-pointer' : ''}`}
    >
      <PlacePhoto place={place} rounded="rounded-none" className={`${photoClass} w-full`}>
        <span className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-paper/95 shadow flex items-center justify-center">
          <Bookmark className={`w-4 h-4 ${saved ? 'text-clay fill-clay' : 'text-ink-3'}`} />
        </span>
        {place.rating && (
          <span className="absolute bottom-2 left-2.5 inline-flex items-center gap-1 px-2 h-6 rounded-full bg-paper/95 text-[11px] font-medium text-ink shadow">
            <Star className="w-3 h-3 text-amber-500 fill-amber-400" />{place.rating}
          </span>
        )}
      </PlacePhoto>

      <div className="p-3.5 flex flex-col gap-1.5 flex-1">
        <h3 className="text-[15px] font-semibold text-ink leading-snug line-clamp-1">{place.name}</h3>
        {loc && (
          <p className="text-[12px] text-ink-3 flex items-center gap-1 line-clamp-1"><MapPin className="w-3.5 h-3.5 shrink-0" />{loc}</p>
        )}
        {!compact && note && (
          <p className="text-[12.5px] text-ink-2 leading-snug line-clamp-2 flex gap-1.5 mt-0.5">
            <Quote className="w-3.5 h-3.5 shrink-0 text-ink-3 mt-0.5" />{note}
          </p>
        )}
        {!compact && tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1">{tags.map(t => <Tag key={t.label} icon={t.Icon}>{t.label}</Tag>)}</div>
        )}

        {!compact && (
          <div className="mt-auto pt-2.5 flex items-center justify-between gap-2 border-t border-line/70">
            {saved ? (
              <>
                {trip && onAddToDay && (
                  <label className="relative inline-flex items-center h-8 pl-2.5 pr-7 rounded-full border border-line bg-paper text-[12px] text-ink-2 hover:bg-cream-2 cursor-pointer max-w-[60%]" onClick={e => e.stopPropagation()}>
                    <CalendarDays className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                    <span className="truncate">{trip.name}</span>
                    <ChevronDown className="w-3.5 h-3.5 absolute right-2" />
                    <select
                      defaultValue=""
                      onChange={e => { if (e.target.value) { onAddToDay(place, parseInt(e.target.value)); e.target.value = ''; } }}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full"
                      aria-label="Add to day"
                    >
                      <option value="" disabled>Add to day…</option>
                      {Array.from({ length: trip.daysCount }, (_, i) => i + 1).map(d => (
                        <option key={d} value={d}>Day {d} {formatDayDate(trip.startDate, d) ? `· ${formatDayDate(trip.startDate, d)}` : ''}</option>
                      ))}
                    </select>
                  </label>
                )}
                <span className="inline-flex items-center gap-1 text-[12px] text-sage-deep font-medium ml-auto">
                  <Check className="w-3.5 h-3.5" /> Saved
                </span>
                {onDelete && (
                  <button onClick={e => { e.stopPropagation(); onDelete(place.id); }} className="p-1.5 text-ink-3 hover:text-red-600 cursor-pointer" title="Remove from saved">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </>
            ) : (
              <button onClick={e => { e.stopPropagation(); onSave?.(place); }}
                className="ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-sage-deep text-white text-[12px] font-medium hover:bg-[#46553a] cursor-pointer">
                <BookmarkPlus className="w-3.5 h-3.5" /> Save
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
