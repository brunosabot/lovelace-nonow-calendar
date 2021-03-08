import {
  css,
  html,
  LitElement,
} from "https://unpkg.com/lit-element@2.0.1/lit-element.js?module";
import dayjs from "https://unpkg.com/dayjs@1.8.24/esm/index.js?module";
import localizedFormat from "https://unpkg.com/dayjs@1.8.24/esm/plugin/localizedFormat/index.js";

dayjs.extend(localizedFormat);

function hashCode(str) {
  return Array.from(str).reduce(
    (hash, letter) => letter.charCodeAt(0) + ((hash << 5) - hash),
    0
  );
}

function intToRGB(i) {
  const c = (i & 0x00ffffff).toString(16).toUpperCase();

  return "#" + "00000".substring(0, 6 - c.length) + c;
}

class NonowCalendar extends LitElement {
  constructor() {
    super();

    this.events = [];
    this.lastUpdate = dayjs("2000-01-01T00:00:00.000Z");
    this.loading = true;
  }

  static get properties() {
    return {
      hass: {},
      config: {},
    };
  }

  async getCalendarData(entity) {
    const timeOffset = -dayjs().utcOffset();
    const start = dayjs()
      .startOf("day")
      .add(timeOffset, "minutes")
      .format("YYYY-MM-DDTHH:mm:ss");
    const end = dayjs()
      .add(this.config.daysToShow, "days")
      .endOf("day")
      .add(timeOffset, "minutes")
      .format("YYYY-MM-DDTHH:mm:ss");
    const url = `calendars/${entity.entity}?start=${start}Z&end=${end}Z`;
    const events = await this.hass.callApi("get", url);
    const color = entity.color || intToRGB(hashCode(entity.entity));

    return events.map((event) => ({
      ...event,
      color,
    }));
  }

  async getEvents() {
    if (dayjs().diff(this.lastUpdate, "minute") < 15) {
      return;
    }

    this.lastUpdate = dayjs();

    const calendarEvents = await Promise.all(
      this.config.entities.map((entity) => this.getCalendarData(entity))
    );

    this.loading = false;
    this.events = Array.prototype.concat
      .apply([], calendarEvents)
      .sort((a, b) =>
        dayjs(a.start.dateTime).diff(dayjs(b.start.dateTime)) > 0 ? 1 : -1
      );

    if (this.config.limit > -1) {
      this.events = this.events.slice(0, this.config.limit);
    }
  }

  renderChip(color) {
    if (this.config.showColor && color) {
      return html`<span
        class="nonow-calendar__chip"
        style="background-color: ${color}"
      ></span>`;
    }

    return "";
  }

  renderEvent(event, i, events) {
    const startDay = dayjs(event.start.dateTime);
    const endDay = dayjs(event.end.dateTime);
    const pad = (value) => String(value).padStart(2, "0");

    const location = this.renderLocation(event.location);
    const progress = this.renderProgress(startDay, endDay);
    const title = this.renderTitle(startDay, events, i);
    const chip = this.renderChip(event.color);

    const endedClass = dayjs().isAfter(endDay) ? "nonow-calendar--ended" : "";

    return html`
      ${title}
      <a
        class="nonow-calendar ${endedClass}"
        href="${event.htmlLink}"
        target="_blank"
      >
        <div class="nonow-calendar__title">
          ${chip}
          <div class="nonow-calendar__name">${event.summary || "Busy"}</div>
        </div>
        <div class="nonow-calendar__details">
          <ha-icon
            class="nonow-calendar__location-icon"
            icon="mdi:clock-outline"
          ></ha-icon>
          <span class="nonow-calendar__date">
            ${pad(startDay.hour())}:${pad(startDay.minute())} -
            ${pad(endDay.hour())}:${pad(endDay.minute())}
          </span>
          ${location}
        </div>
        ${progress}
      </a>
    `;
  }

  renderLocation(location) {
    if (this.config.showLocation && location) {
      return html`
        <ha-icon
          class="nonow-calendar__location-icon"
          icon="mdi:map-marker"
        ></ha-icon>
        <span class="nonow-calendar__location-place">${location}</span>
      `;
    }

    return "";
  }

  renderProgress(startDay, endDay) {
    if (dayjs().isBefore(endDay) && dayjs().isAfter(startDay)) {
      const progressPercentage =
        (100 * startDay.diff(dayjs())) / startDay.diff(endDay);

      return html`<div
        class="nonow-calendar__progress"
        style="width: ${progressPercentage}%"
      ></div>`;
    }

    return "";
  }

  renderTitle(startDay, events, i) {
    if (
      i === 0 ||
      (i > 0 &&
        startDay.isSame(dayjs(events[i - 1].start.dateTime), "day") === false)
    ) {
      return html`<div class="nonow-calendar__day-title">
        ${startDay.format("LL")}
      </div>`;
    }

    return "";
  }

  render() {
    this.getEvents();

    let message = "";
    if (this.loading === true) {
      message = html`<div class="nonow-calendar__message">
        ${this.config.loadingMessage}
      </div>`;
    } else if (this.events.length === 0) {
      message = html`<div class="nonow-calendar__message">
        ${this.config.noEventMessage}
      </div>`;
    }

    return html`
      <ha-card header="${this.config.title}">
        <div class="nonow-calendar__wrapper">
          ${message}
          ${this.events.map((event, i, events) =>
            this.renderEvent(event, i, events)
          )}
        </div>
      </ha-card>
    `;
  }

  setConfig(config) {
    const {
      daysToShow = 7,
      entities = [],
      loadingMessage = "Loading...",
      noEventMessage = "No upcoming event",
      showColor = true,
      showLocation = true,
      title = "Calendar",
      limit = -1,
    } = config;

    if (
      config.entities instanceof Array === false ||
      config.entities.length < 1
    ) {
      throw new Error("You need to define an entity");
    }

    this.config = {
      daysToShow,
      entities,
      loadingMessage,
      noEventMessage,
      showColor,
      showLocation,
      title,
      limit,
    };
  }

  static get styles() {
    return css`
      .nonow-calendar {
        color: inherit;
        display: block;
        padding: 4px 24px;
        position: relative;
        text-decoration: none;
      }
      .nonow-calendar--ended {
        opacity: var(--nonow-calendar--ended-opacity, 0.5);
      }
      .nonow-calendar__chip {
        border-radius: 50%;
        display: inline-block;
        flex-shrink: 0;
        height: 11px;
        margin: 1px 5px 1px 1px;
        width: 11px;
      }
      .nonow-calendar__date {
        flex-shrink: 0;
        margin-right: 16px;
        min-width: 66px;
        white-space: nowrap;
      }
      .nonow-calendar__day-title {
        font-size: 0.9em;
        font-weight: 700;
        margin: 8px 0 4px 0;
        padding: 0 24px;
        text-transform: uppercase;
      }
      .nonow-calendar__details {
        align-items: center;
        color: var(--nonow-calendar-details-color, var(--secondary-text-color));
        display: flex;
        font-size: 0.9em;
        height: 16px;
      }
      .nonow-calendar__location-icon {
        --mdc-icon-size: 12px;
        flex-shrink: 0;
        display: flex;
        margin-right: 4px;
      }
      .nonow-calendar__location-place {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .nonow-calendar__message {
        padding: 0 24px;
      }
      .nonow-calendar__name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .nonow-calendar__progress {
        background-color: var(
          --nonow-calendar-progress-color,
          var(--accent-color)
        );
        border-radius: 0 2px 2px 0;
        bottom: 0;
        height: 2px;
        height: 2px;
        left: 0;
        opacity: var(--nonow-calendar-progress-opacity, 0.3);
        position: absolute;
      }
      .nonow-calendar__title {
        align-items: center;
        display: flex;
        height: 20px;
      }
      .nonow-calendar__wrapper {
        padding: 0 0 24px 0;
      }
    `;
  }
}

customElements.define("nonow-calendar", NonowCalendar);
