import type { Monitor, MonitorStatusResponse } from "@/types/index.js";
import type { Incident } from "@/types/incident.js";
import type { MonitorActionDecision } from "@/service/infrastructure/SuperSimpleQueue/SuperSimpleQueueHelper.js";
import { IIncidentsRepository, INotificationsRepository } from "@/repositories/index.js";
import { INotificationsService } from "@/service/infrastructure/notificationsService.js";
import { ILogger } from "@/utils/logger.js";
import type { ISettingsService } from "@/service/system/settingsService.js";

export interface IEscalationService {
	checkAndSendEscalation: (incident: Incident, monitor: Monitor, monitorStatusResponse: MonitorStatusResponse) => Promise<void>;
}

const SERVICE_NAME = "EscalationService";

export class EscalationService implements IEscalationService {
	static SERVICE_NAME = SERVICE_NAME;

	private incidentsRepository: IIncidentsRepository;
	private notificationsRepository: INotificationsRepository;
	private notificationsService: INotificationsService;
	private settingsService: ISettingsService;
	private logger: ILogger;

	constructor(
		incidentsRepository: IIncidentsRepository,
		notificationsRepository: INotificationsRepository,
		notificationsService: INotificationsService,
		settingsService: ISettingsService,
		logger: ILogger
	) {
		this.incidentsRepository = incidentsRepository;
		this.notificationsRepository = notificationsRepository;
		this.notificationsService = notificationsService;
		this.settingsService = settingsService;
		this.logger = logger;
	}

	checkAndSendEscalation = async (
		incident: Incident,
		monitor: Monitor,
		monitorStatusResponse: MonitorStatusResponse
	): Promise<void> => {
		try {
			this.logger.debug({
				message: `[ESCALATION DEBUG] Checking escalation for monitor ${monitor.id}: enabled=${monitor.escalation?.enabled}, incident=${incident.id}, status=${incident.status}, escalationSent=${incident.escalationSent}`,
				service: SERVICE_NAME,
				method: "checkAndSendEscalation",
			});

			// If escalation not enabled, skip
			if (!monitor.escalation?.enabled) {
				this.logger.debug({
					message: `[ESCALATION DEBUG] Escalation not enabled for monitor ${monitor.id}`,
					service: SERVICE_NAME,
					method: "checkAndSendEscalation",
				});
				return;
			}

			// If incident not active, skip
			if (!incident.status) {
				this.logger.debug({
					message: `[ESCALATION DEBUG] Incident not active for monitor ${monitor.id}`,
					service: SERVICE_NAME,
					method: "checkAndSendEscalation",
				});
				return;
			}

			// If escalation already sent for this incident, skip
			if (incident.escalationSent) {
				this.logger.debug({
					message: `[ESCALATION DEBUG] Escalation already sent for incident ${incident.id}`,
					service: SERVICE_NAME,
					method: "checkAndSendEscalation",
				});
				return;
			}

			// Calculate incident duration in minutes
			const startTime = new Date(incident.startTime).getTime();
			const currentTime = Date.now();
			const durationMinutes = (currentTime - startTime) / (1000 * 60);

			this.logger.debug({
				message: `[ESCALATION DEBUG] Monitor ${monitor.id}: duration=${durationMinutes.toFixed(1)}min, threshold=${monitor.escalation.durationMinutes}min`,
				service: SERVICE_NAME,
				method: "checkAndSendEscalation",
			});

			// Check if duration threshold has been met
			if (durationMinutes < monitor.escalation.durationMinutes) {
				this.logger.debug({
					message: `[ESCALATION DEBUG] Duration threshold not met for monitor ${monitor.id}`,
					service: SERVICE_NAME,
					method: "checkAndSendEscalation",
				});
				return;
			}

			this.logger.info({
				message: `[ESCALATION DEBUG] Duration threshold MET for monitor ${monitor.id}, sending escalation notification`,
				service: SERVICE_NAME,
				method: "checkAndSendEscalation",
			});

			// Get the notification to send
			const notificationId = monitor.escalation.notificationId.toString();
			this.logger.debug({
				message: `[ESCALATION DEBUG] Looking up notification ${notificationId} for team ${monitor.teamId}`,
				service: SERVICE_NAME,
				method: "checkAndSendEscalation",
			});

			const notification = await this.notificationsRepository.findById(notificationId, monitor.teamId);
			if (!notification) {
				this.logger.warn({
					message: `Escalation notification ${notificationId} not found`,
					service: SERVICE_NAME,
					method: "checkAndSendEscalation",
				});
				return;
			}

			// Build decision for escalation notification
			const decision: MonitorActionDecision = {
				shouldCreateIncident: false,
				shouldResolveIncident: false,
				shouldSendNotification: true,
				incidentReason: null,
				notificationReason: "escalation",
			};

			this.logger.info({
				message: `[ESCALATION DEBUG] Sending escalation notification to ${notification.type} (${notificationId})`,
				service: SERVICE_NAME,
				method: "checkAndSendEscalation",
			});

			// Send escalation notification to the specified channel
			try {
				await this.notificationsService.sendNotificationsToIds([notificationId], monitor, monitorStatusResponse, decision);

				this.logger.info({
					message: `[ESCALATION DEBUG] Escalation notification sent, marking incident as escalationSent=true`,
					service: SERVICE_NAME,
					method: "checkAndSendEscalation",
				});

				// Mark escalation as sent
				await this.incidentsRepository.updateById(incident.id, monitor.teamId, {
					escalationSent: true,
				});

				this.logger.info({
					message: `Escalation notification sent for monitor ${monitor.id} after ${durationMinutes.toFixed(1)} minutes`,
					service: SERVICE_NAME,
					method: "checkAndSendEscalation",
				});
			} catch (error: unknown) {
				this.logger.error({
					message: `Failed to send escalation notification: ${error instanceof Error ? error.message : "Unknown error"}`,
					service: SERVICE_NAME,
					method: "checkAndSendEscalation",
					stack: error instanceof Error ? error.stack : undefined,
				});
			}
		} catch (error: unknown) {
			this.logger.error({
				message: `Error in checkAndSendEscalation: ${error instanceof Error ? error.message : "Unknown error"}`,
				service: SERVICE_NAME,
				method: "checkAndSendEscalation",
				stack: error instanceof Error ? error.stack : undefined,
			});
		}
	};
}

