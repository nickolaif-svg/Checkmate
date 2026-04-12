import { Controller } from "react-hook-form";
import { useTheme } from "@mui/material";
import Stack from "@mui/material/Stack";
import { useTranslation } from "react-i18next";
import { useGet } from "@/Hooks/UseApi";
import {
	SwitchComponent,
	TextField,
	Autocomplete,
} from "@/Components/inputs";
import type { Notification } from "@/Types/Notification";
import { SPACING, LAYOUT } from "@/Utils/Theme/constants";
import Typography from "@mui/material/Typography";

interface EscalationSettingsProps {
	control: any; // React Hook Form control
}

export const EscalationSettings = ({ control }: EscalationSettingsProps) => {
	const theme = useTheme();
	const { t } = useTranslation();
	const { data: notifications } = useGet<Notification[]>("/notifications/team");

	return (
		<Stack spacing={theme.spacing(LAYOUT.MD)}>
			<Controller
				name="escalation.enabled"
				control={control}
				render={({ field }) => (
					<Stack
						direction="row"
						alignItems="center"
						spacing={theme.spacing(SPACING.LG)}
					>
						<SwitchComponent
							checked={field.value || false}
							onChange={(e) => field.onChange(e.target.checked)}
						/>
						<Typography>
							{t("pages.createMonitor.form.escalation.enabled")}
						</Typography>
					</Stack>
				)}
			/>

			<Controller
				name="escalation.durationMinutes"
				control={control}
				render={({ field, fieldState }) => (
					<TextField
						{...field}
						type="number"
						fieldLabel={t("pages.createMonitor.form.escalation.duration")}
						placeholder={t("pages.createMonitor.form.escalation.durationPlaceholder")}
						helperText={t("pages.createMonitor.form.escalation.durationHelp")}
						fullWidth
						error={!!fieldState.error}
						value={field.value || ""}
						onChange={(e) => {
							const val = e.target.value;
							field.onChange(val === "" ? 0 : Number(val));
						}}
					/>
				)}
			/>

			<Controller
				name="escalation.notificationId"
				control={control}
				render={({ field, fieldState }) => {
					const notificationOptions = (notifications ?? []).map((n) => ({
						...n,
						name: n.notificationName,
					}));
					const selectedNotification =
						field.value && notificationOptions.length > 0
							? notificationOptions.find((n) => n.id === field.value)
							: null;

					return (
						<Stack spacing={theme.spacing(LAYOUT.SM)}>
							<Typography variant="subtitle2">
								{t("pages.createMonitor.form.escalation.notification")}
							</Typography>
							<Autocomplete
								options={notificationOptions}
								value={selectedNotification || null}
								getOptionLabel={(option) => option.name}
								onChange={(_: unknown, newValue: any) => {
									field.onChange(newValue?.id || "");
								}}
								isOptionEqualToValue={(option, value) => option.id === value.id}
								disabled={notificationOptions.length === 0}
							/>
							{notificationOptions.length === 0 && (
								<Typography variant="caption" color="error">
									{t("pages.createMonitor.form.escalation.noNotifications")}
								</Typography>
							)}
							{fieldState.error && (
								<Typography variant="caption" color="error">
									{fieldState.error.message}
								</Typography>
							)}
						</Stack>
					);
				}}
			/>
		</Stack>
	);
};
