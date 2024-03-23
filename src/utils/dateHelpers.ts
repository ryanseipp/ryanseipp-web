import {
  addMonths,
  formatDurationWithOptions,
  intervalToDuration,
} from "date-fns/fp";
import {enUS} from "date-fns/locale";

export const formatDuration = (startDate: Date, endDate?: Date) =>
  formatDurationWithOptions(
    {locale: enUS, delimiter: ", ", format: ["years", "months"]},
    intervalToDuration({
      start: addMonths(-1, startDate),
      end: endDate ?? addMonths(1, new Date()),
    }),
  );

const subtractMonth = addMonths(-1);

const getExperienceRangeFormatter =
  (format: Intl.DateTimeFormat) => (startDate: Date, endDate: Date) =>
    `${format.formatRange(subtractMonth(startDate), subtractMonth(endDate))} ꞏ ${formatDuration(startDate, subtractMonth(endDate))}`;

const getExperienceToPresentFormatter =
  (format: Intl.DateTimeFormat) => (startDate: Date) =>
    `${format.format(subtractMonth(startDate))} - Present ꞏ ${formatDuration(startDate)}`;

export const getDateSpanFormatter = (format: Intl.DateTimeFormat) => {
  const formatExperienceRange = getExperienceRangeFormatter(format);
  const formatExperienceToPresent = getExperienceToPresentFormatter(format);

  return (startDate: Date, endDate?: Date) =>
    endDate
      ? formatExperienceRange(startDate, endDate)
      : formatExperienceToPresent(startDate);
};

export const getDefaultDateSpanFormatter = () => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
  });

  return getDateSpanFormatter(formatter);
};
