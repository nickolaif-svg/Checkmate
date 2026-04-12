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
			// If escalation not enabled, skip
			if (!monitor.escalation?.enabled) {
				return;
			}

			// If incident not active, skip
			if (!incident.status) {
				return;
			}

			// If escalation already sent for this incident, skip
			if (incident.escalationSent) {
				return;
			}

			// Calculate incident duration in minutes
			const startTime = new Date(incident.startTime).getTime();
			const currentTime = Date.now();
			const durationMinutes = (currentTime - startTime) / (1000 * 60);

			// Check if duration threshold has been met
			if (durationMinutes < monitor.escalation.durationMinutes) {
				return;
			}

			// Get the notification to send
			const notificationId = monitor.escalation.notificationId.toString();
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

			// Send escalation notification to the specified channel
			try {
				await this.notificationsService.sendNotificationsToIds([notificationId], monitor, monitorStatusResponse, decision);

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

