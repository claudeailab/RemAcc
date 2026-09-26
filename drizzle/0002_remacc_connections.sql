CREATE TABLE `webapp_credentials` (
  `id` int AUTO_INCREMENT NOT NULL,
  `name` varchar(255) NOT NULL,
  `username` varchar(255) NOT NULL,
  `password` text NOT NULL,
  `domain` varchar(255),
  `notes` text,
  `created_at` timestamp DEFAULT (now()),
  `updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `webapp_credentials_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `webapp_folders` (
  `id` int AUTO_INCREMENT NOT NULL,
  `name` varchar(255) NOT NULL,
  `parent_id` int,
  `credential_id` int,
  `created_at` timestamp DEFAULT (now()),
  `updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `webapp_folders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `webapp_connections` (
  `id` int AUTO_INCREMENT NOT NULL,
  `name` varchar(255) NOT NULL,
  `host` varchar(255) NOT NULL,
  `port` int,
  `protocol` varchar(10) NOT NULL DEFAULT 'rdp',
  `folder_id` int,
  `credential_id` int,
  `notes` text,
  `created_at` timestamp DEFAULT (now()),
  `updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `webapp_connections_id` PRIMARY KEY(`id`)
);
